import { AmmUtils, fromPrice, TokenAmount } from "../utils/index.js";

import * as saber from "@saberhq/stableswap-sdk";
import type { Token } from "@saberhq/token-utils";
import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { Big } from "@switchboard-xyz/common";
import JSBI from "jsbi";
import type { Response } from "undici";
import { fetch } from "undici";

export class SaberSwap {
  public saberPoolMap: Promise<Map<string, any>>;
  public saberTokenMap: Promise<Map<string, Token>>;
  public connection: Connection;
  private poolLastUpdated: number | undefined = undefined;
  private tokenLastUpdated: number | undefined = undefined;

  constructor(mainnetConnection: Connection) {
    this.saberPoolMap = this.getSaberPools();
    this.saberTokenMap = this.getSaberTokenMap();
    this.connection = mainnetConnection;
  }

  /** Load a map from sabers github repo that maps a pools PublicKey to its metadata
   * When successfully updated from a remote source, update the last updated timestamp
   * 1st Pri - githubusercontent
   * 2nd Pri - cdn
   * 3rd Pri - local json file
   */
  async getSaberPools(): Promise<Map<string, any>> {
    let response: Response;
    let saberPoolList: any;
    try {
      const saberPoolListUrl =
        "https://raw.githubusercontent.com/saber-hq/saber-registry-dist/master/data/pools-info.mainnet.json";
      response = await fetch(saberPoolListUrl);
      if (!response.ok) {
        throw new Error("failed to load saber pools from githubusercontent");
      }
    } catch {
      try {
        const saberPoolListUrl =
          "https://cdn.jsdelivr.net/gh/saber-hq/saber-registry-dist@master/data/pools-info.mainnet.json";
        response = await fetch(saberPoolListUrl);
        if (!response.ok) {
          throw new Error("failed to load saber pools from cdn");
        }
      } catch {
        console.log(
          "failed to load saber pools from external host, parsing json file"
        );
      }
    } finally {
      // load poolMap from a local JSON file as a last resort
      if (response!.ok) {
        saberPoolList = await response!.json();
        this.poolLastUpdated = Date.now();
      } else {
        // saberPoolList = localSaberPoolList;
      }
    }

    const saberPools = saberPoolList.pools;
    const saberPoolMap = new Map();
    for (const pool of saberPools) {
      saberPoolMap.set(pool.swap.config.swapAccount, pool);
    }

    return saberPoolMap;
  }

  /** Load a map from sabers github repo that maps a tokens PublicKey to its Token struct
   * When successfully updated from a remote source, update the last updated timestamp
   * 1st Pri - githubusercontent
   * 2nd Pri - cdn
   * 3rd Pri - local json file
   */
  async getSaberTokenMap(): Promise<Map<string, Token>> {
    let response: Response;
    let saberTokenList: any;
    try {
      const saberPoolListUrl =
        "https://raw.githubusercontent.com/saber-hq/saber-registry-dist/master/data/token-list.mainnet.json";
      response = await fetch(saberPoolListUrl);
      if (!response.ok) {
        throw new Error("failed to load saber tokens from githubusercontent");
      }
    } catch {
      try {
        const saberPoolListUrl =
          "https://cdn.jsdelivr.net/gh/saber-hq/saber-registry-dist@master/data/token-list.mainnet.json";
        response = await fetch(saberPoolListUrl);
        if (!response.ok) {
          throw new Error("failed to load saber tokens from cdn");
        }
      } catch {
        console.log(
          "failed to load saber tokens from external host, parsing json file"
        );
      }
    } finally {
      // load tokenMap from a local JSON file as a last resort
      if (response!.ok) {
        saberTokenList = await response!.json();
        this.tokenLastUpdated = Date.now();
      } else {
        // saberTokenList = localSaberTokenList;
      }
    }

    const saberTokenMap = new Map<string, Token>();
    for (const token of saberTokenList.tokens) {
      saberTokenMap.set(token.address, token);
    }

    return saberTokenMap;
  }

  /** Search in the poolMap for a given pool address
   * If an address is not found in the cache and the cache is
   * more than 12hours old, attempt to refresh the cache and find the address
   */
  private async findPool(poolAddress: string): Promise<any | undefined> {
    const poolMap = await this.saberPoolMap;
    const lpPool = poolMap.get(poolAddress);
    if (lpPool) {
      return lpPool;
    }

    // If pool is not in cache but cache was refreshed less than 12 hours ago, return undefined
    if (
      this.poolLastUpdated &&
      Date.now() - this.poolLastUpdated < 12 * 60 * 60 * 1000
    ) {
      return undefined;
    }

    try {
      const newPoolMap = this.getSaberPools();
      if ((await newPoolMap).has(poolAddress)) {
        this.saberPoolMap = newPoolMap;
        return (await newPoolMap).get(poolAddress);
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  /** Search in the tokenMap for a given token address
   * If an address is not found in the cache and the cache is
   * more than 12hours old, attempt to refresh the cache and find the address
   */
  private async findToken(tokenAddress: string): Promise<Token | undefined> {
    const tokenMap = await this.saberTokenMap;
    const token = tokenMap.get(tokenAddress);
    if (token) {
      return token;
    }

    // If token is not in cache but cache was refreshed less than 12 hours ago, return undefined
    if (
      this.tokenLastUpdated &&
      Date.now() - this.tokenLastUpdated < 12 * 60 * 60 * 1000
    ) {
      return undefined;
    }

    try {
      const newTokenMap = this.getSaberTokenMap();
      if ((await newTokenMap).has(tokenAddress)) {
        this.saberTokenMap = newTokenMap;
        return (await newTokenMap).get(tokenAddress);
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  /** Load the exchange info for a given LP pool */
  private async loadSaberExchangeInfo(
    poolAddress: PublicKey
  ): Promise<saber.IExchangeInfo> {
    const lpPool = await this.findPool(poolAddress.toBase58());
    if (!lpPool) throw new Error("UnknownSaberPool");

    const programID = new PublicKey(lpPool.swap.config.swapProgramID);
    const lpToken = new PublicKey(lpPool.lpToken.address);
    const swapAccount = new PublicKey(lpPool.swap.config.swapAccount);
    const swap = await saber.StableSwap.load(
      this.connection,
      swapAccount,
      programID
    );

    const tokenAddressA = lpPool.swap.state.tokenA.mint;
    const tokenA = await this.findToken(tokenAddressA);
    if (!tokenA) throw new Error("UnknownSaberToken");

    const tokenAddressB = lpPool.swap.state.tokenB.mint;
    const tokenB = await this.findToken(tokenAddressB);
    if (!tokenB) throw new Error("UnknownSaberToken");

    const exchange = saber.makeExchange({
      swapAccount,
      lpToken,
      tokenA,
      tokenB,
    });
    if (!exchange) throw new Error("FailedToFetchSaberExchange");
    const exchangeInfo = await saber.loadExchangeInfo(
      this.connection,
      exchange,
      swap
    );

    return exchangeInfo;
  }

  /** Load the exchange info for a given LP pool */
  private async loadSaberExchange(poolAddress: PublicKey): Promise<{
    amp: number;
    lp: TokenAmount;
    base: TokenAmount;
    quote: TokenAmount;
    exchangeInfo: saber.IExchangeInfo;
  }> {
    const exchangeInfo = await this.loadSaberExchangeInfo(poolAddress);
    const lp = new TokenAmount(
      BigInt(exchangeInfo.lpTotalSupply.raw.toString()),
      exchangeInfo.lpTotalSupply.token.decimals
    );
    const base = new TokenAmount(
      BigInt(exchangeInfo.reserves[0].amount.raw.toString()),
      exchangeInfo.reserves[0].amount.token.decimals
    );
    const quote = new TokenAmount(
      BigInt(exchangeInfo.reserves[1].amount.raw.toString()),
      exchangeInfo.reserves[1].amount.token.decimals
    );
    return {
      lp,
      base,
      quote,
      amp: JSBI.toNumber(exchangeInfo.ampFactor),
      exchangeInfo,
    };
  }

  public async oldCalculateFairLpTokenPrice(
    poolAddress: PublicKey,
    feedPricesPromise: Promise<Big[]>
  ): Promise<Big> {
    const exchangeInfo = await this.loadSaberExchangeInfo(poolAddress);
    const price = saber.calculateVirtualPrice(exchangeInfo);
    if (!price) throw new Error("FailedToCalculateSaberLpPrice");
    const vPrice = fromPrice(price);

    let prices: Big[];
    try {
      prices = await feedPricesPromise;
      if (prices.length !== exchangeInfo.reserves.length) {
        throw new Error(
          `Incorrect number of prices. Expected ${exchangeInfo.reserves.length}, Received ${prices.length}`
        );
      }
    } catch (error) {
      throw error;
    }

    const minPrice = prices.sort((a, b) => a.cmp(b)).shift() ?? null;
    if (minPrice === null) {
      throw new Error("EmptyPriceError");
    }
    const result = new Big(minPrice).mul(vPrice);

    return result;
  }

  // https://www.chainlinkecosystem.com/ecosystem/curve/
  /** Calculate the LP token's price for a given LP pool */
  public async calculateFairLpTokenPrice(
    poolAddress: PublicKey,
    feedPricesPromise: Promise<Big[]>
  ): Promise<Big> {
    const { amp, lp, base, quote } = await this.loadSaberExchange(poolAddress);
    return AmmUtils.stableCurve.calculateFairLpPrice(
      amp,
      lp,
      [base, quote],
      await feedPricesPromise
    );
  }

  public async oldCalculateLpTokenPrice(
    poolAddress: PublicKey,
    exchangeInfo?: saber.IExchangeInfo
  ): Promise<Big> {
    const saberVPrice = saber.calculateVirtualPrice(
      exchangeInfo ?? (await this.loadSaberExchangeInfo(poolAddress))
    );
    if (!saberVPrice) {
      throw new Error(`Failed to compute Saber client vPrice`);
    }
    const vPrice = fromPrice(saberVPrice);

    return vPrice;
  }

  /** Calculate the LP token's price for a given LP pool */
  public async calculateLpTokenPrice(poolAddress: PublicKey): Promise<Big> {
    const { amp, lp, base, quote } = await this.loadSaberExchange(poolAddress);
    const vPrice = AmmUtils.stableCurve.calculateVirtualPrice(amp, lp, [
      base,
      quote,
    ]);

    return vPrice;
  }

  /** Calculate the price to swap between two members of an LP pool */
  public async calculateSwapPrice(poolAddress: PublicKey): Promise<Big> {
    const exchangeInfo = await this.loadSaberExchangeInfo(poolAddress);

    const swapPrice = saber.calculateSwapPrice(exchangeInfo);
    if (!swapPrice) throw new Error("FailedToCalculateSaberSwapPrice");

    return fromPrice(swapPrice);
  }

  /** Calculate the price to swap between two members of an LP pool */
  public async newCalculateSwapPrice(poolAddress: PublicKey): Promise<Big> {
    const { amp, lp, base, quote } = await this.loadSaberExchange(poolAddress);

    // TODO: Need to swap input amount and compare to output amount
    // FROM Saber:
    // We try to get at least 4 decimal points of precision here
    // Otherwise, we attempt to swap 1% of total supply of the pool
    // or at most, $1

    return AmmUtils.stableCurve.calculateVirtualPrice(amp, lp, [base, quote]);
  }
}
