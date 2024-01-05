import { AmmUtils, fromRaydiumPrice, TokenAmount } from "../utils/index.js";

import * as raydium from "@raydium-io/raydium-sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { AccountInfo, Connection } from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";
import type { Big } from "@switchboard-xyz/common";
import { BigUtils } from "@switchboard-xyz/common";
import { SolanaClock } from "@switchboard-xyz/solana.js";
import { fetch } from "undici";

type RaydiumPool = raydium.LiquidityPoolKeys;
type RaydiumPoolMap = Map<
  string,
  raydium.ReplaceType<raydium.LiquidityPoolKeysV4, string, PublicKey>
>;

type RaydiumV3Pool = raydium.ApiAmmV3PoolsItem;

type RaydiumPoolV3Map = Map<string, RaydiumV3Pool>;

export class RaydiumExchange {
  private _pools?: Promise<RaydiumPoolMap>;

  private _v3Pools?: Promise<RaydiumPoolV3Map>;

  constructor(private readonly connection: Connection) {}

  async load(retryCount = 2, error?: any): Promise<number> {
    if (retryCount > 0) {
      try {
        const [pools, v3Pools] = await Promise.all([this.pools, this.v3Pools]);
        if (pools.size === 0) {
          throw new Error(`no pools loaded`);
        }
        if (v3Pools.size === 0) {
          throw new Error(`no pools loaded`);
        }
        return pools.size + v3Pools.size;
      } catch (error: any) {
        const pools = await this.load(--retryCount, error);
        return pools;
      }
    }
    throw new Error(
      `Failed to load Raydium pools${error ? ": " + error.toString() : ""}`
    );
  }

  get pools(): Promise<RaydiumPoolMap> {
    return (async () => {
      try {
        if (this._pools === undefined) {
          const response = await fetch(
            "https://api.raydium.io/v2/sdk/liquidity/mainnet.json"
          );
          if (!response.ok) {
            throw new Error(`${response.status}: ${await response.text()}`);
          }
          const json = (await response.json()) as raydium.ApiPoolInfo;
          const pools: raydium.ApiPoolInfoItem[] = [
            ...json.official,
            ...json.unOfficial,
          ];
          this._pools = new Promise((resolve, reject) => {
            resolve(
              new Map(
                pools.map((pool) => [
                  pool.id.toString(),
                  raydium.jsonInfo2PoolKeys(pool),
                ])
              )
            );
          });
        }
        return this._pools;
      } catch (e: any) {
        throw new Error(`failed to load Raydium pools, ${e.message}`);
      }
    })();
  }

  get v3Pools(): Promise<RaydiumPoolV3Map> {
    return (async () => {
      try {
        if (this._v3Pools === undefined) {
          const response = await fetch(
            "https://api.raydium.io/v2/ammV3/ammPools"
          );
          if (!response.ok) {
            throw new Error(`${response.status}: ${await response.text()}`);
          }
          const json = (await response.json()) as raydium.ApiAmmV3Pools;
          const pools: raydium.ApiAmmV3PoolsItem[] = json.data;
          this._v3Pools = new Promise((resolve, reject) => {
            resolve(
              new Map(
                pools.map((pool) => [
                  pool.id.toString(),
                  pool,
                  // raydium.jsonInfo2PoolKeys({
                  //   ...pool,
                  //   ammConfig: {
                  //     ...pool.ammConfig,
                  //     description: undefined,
                  //   },
                  // }),
                ])
              )
            );
          });
        }
        return this._v3Pools;
      } catch (e: any) {
        throw new Error(`failed to load Raydium pools, ${e.message}`);
      }
    })();
  }

  public async newCalculateSwapPrice(poolAddress: PublicKey): Promise<Big> {
    const pools = await this.pools;
    const pool = pools.get(poolAddress.toString());
    if (!pool) {
      throw new Error(`Failed to find Raydium pool for ${poolAddress}`);
    }

    // StableCurve
    if (
      pool.version === 5 ||
      pool.programId.equals(raydium.MAINNET_PROGRAM_ID.AmmStable)
    ) {
      // const poolInfo = await raydium.Liquidity.fetchInfo({
      //   connection: this.connection,
      //   poolKeys: pool,
      // });
      // const swapPrice = raydium.Liquidity.getRate(poolInfo);
      // return fromRaydiumPrice(swapPrice);
      throw new Error(`StableCurve is currently disabled for Raydium pools`);
    }

    // ConstantProduct
    const poolInfo = await raydium.Liquidity.fetchInfo({
      connection: this.connection,
      poolKeys: pool,
    });
    const { base, quote } = this.decodePoolInfo(poolInfo);
    const swapPrice = AmmUtils.constantProduct.calculateSwapPrice(base, quote);
    return swapPrice;
  }

  public async calculateClmmSwapPrice(
    poolAddress: PublicKey,
    poolConfig: RaydiumV3Pool
  ): Promise<Big> {
    const chainTime = (
      await SolanaClock.fetch(this.connection)
    ).unixTimestamp.toNumber();
    const allRequestedPoolInfos = await raydium.AmmV3.fetchMultiplePoolInfos({
      connection: this.connection,
      poolKeys: [poolConfig],
      ownerInfo: undefined,
      chainTime: chainTime,
    });
    const poolInfo = allRequestedPoolInfos[poolAddress.toString()];
    if (!poolInfo) {
      throw new Error(
        `Failed to fetch Raydium pool info for CLMM pool ${poolAddress}`
      );
    }

    const tickPrice = raydium.AmmV3.getTickPrice({
      poolInfo: poolInfo.state,
      tick: poolInfo.state.tickCurrent,
      baseIn: true,
    });

    return BigUtils.fromDecimal(tickPrice.price);
  }

  public async calculateSwapPrice(poolAddress: PublicKey): Promise<Big> {
    const pools = await this.pools;
    const pool = pools.get(poolAddress.toString());
    if (!pool) {
      // check if its a CLMM pool
      const v3Pools = await this.v3Pools;
      const v3Pool = v3Pools.get(poolAddress.toString());
      if (!v3Pool) {
        throw new Error(`Failed to find Raydium pool for ${poolAddress}`);
      }
      return await this.calculateClmmSwapPrice(poolAddress, v3Pool);
    }

    const { currentPrice, executionPrice } = await raydium.Liquidity.fetchInfo({
      connection: this.connection,
      poolKeys: pool,
    }).then((poolInfo) => {
      const { currentPrice, executionPrice } =
        raydium.Liquidity.computeAmountOut({
          poolKeys: pool,
          poolInfo,
          amountIn: new raydium.TokenAmount(
            /* token= */ new raydium.Token(
              TOKEN_PROGRAM_ID,
              pool.baseMint,
              poolInfo.baseDecimals
            ),
            /* amount= */ 100,
            /* isRaw= */ false
          ),
          currencyOut: new raydium.Token(
            TOKEN_PROGRAM_ID,
            pool.quoteMint,
            poolInfo.quoteDecimals
          ),
          slippage: new raydium.Percent(1, 100), // 1% slippage,
        });
      return { currentPrice, executionPrice };
    });
    if (executionPrice === null) {
      throw new Error(`Failed to find Raydium price for ${poolAddress}`);
    }
    if (!fromRaydiumPrice(executionPrice!).gt(0)) {
      throw new Error(`Failed to find Raydium price for ${poolAddress}`);
    }
    if (!fromRaydiumPrice(currentPrice).gt(0)) {
      throw new Error(`Failed to find Raydium price for ${poolAddress}`);
    }
    return fromRaydiumPrice(currentPrice);
  }

  public async oldCalculateFairLpTokenPrice(
    poolAddress: PublicKey,
    feedPricesPromise: Promise<Big[]>
  ): Promise<Big> {
    const pools = await this.pools;
    const pool = pools.get(poolAddress.toString());
    if (!pool) {
      throw new Error(`Failed to find Raydium pool for ${poolAddress}`);
    }

    const poolInfo = await raydium.Liquidity.fetchInfo({
      connection: this.connection,
      poolKeys: pool,
    });

    // const r0 = fromBN(baseReserve, baseDecimals);
    // const r1 = fromBN(quoteReserve, quoteDecimals);
    // const tokenSupply = fromBN(lpSupply, lpDecimals);

    try {
      const result = AmmUtils.constantProduct.calculateFairLpPrice(
        new TokenAmount(
          BigInt(poolInfo.lpSupply.toString()),
          poolInfo.lpDecimals
        ),
        [
          new TokenAmount(
            BigInt(poolInfo.baseReserve.toString()),
            poolInfo.baseDecimals
          ),
          new TokenAmount(
            BigInt(poolInfo.quoteReserve.toString()),
            poolInfo.quoteDecimals
          ),
        ],
        await feedPricesPromise
      );
      return result;
    } catch (error) {
      throw error;
    }
  }

  public async calculateFairLpTokenPrice(
    poolAddress: PublicKey,
    feedPricesPromise: Promise<Big[]>
  ): Promise<Big> {
    const pools = await this.pools;
    const pool = pools.get(poolAddress.toString());
    if (!pool) {
      throw new Error(`Failed to find Raydium pool for ${poolAddress}`);
    }

    // StableCurve
    if (
      pool.version === 5 ||
      pool.programId.equals(raydium.MAINNET_PROGRAM_ID.AmmStable)
    ) {
      // const { base, quote, lp } = await this.fetchPoolAccounts(pool);

      // const fairPrice = AmmUtils.stableCurve.calculateFairLpPrice(
      //   10,
      //   lp,
      //   [base, quote],
      //   await feedPricesPromise
      // );
      // return fairPrice;
      throw new Error(`StableCurve is currently disabled for Raydium pools`);
    }

    const poolInfo = await raydium.Liquidity.fetchInfo({
      connection: this.connection,
      poolKeys: pool,
    });
    const { base, quote, lp } = this.decodePoolInfo(poolInfo);

    const result = AmmUtils.constantProduct.calculateFairLpPrice(
      lp,
      [base, quote],
      await feedPricesPromise
    );
    return result;
  }

  decodePoolInfo(poolInfo: raydium.LiquidityPoolInfo): {
    base: TokenAmount;
    quote: TokenAmount;
    lp: TokenAmount;
  } {
    return {
      base: new TokenAmount(
        BigInt(poolInfo.baseReserve.toString()),
        poolInfo.baseDecimals
      ),
      quote: new TokenAmount(
        BigInt(poolInfo.quoteReserve.toString()),
        poolInfo.quoteDecimals
      ),
      lp: new TokenAmount(
        BigInt(poolInfo.lpSupply.toString()),
        poolInfo.lpDecimals
      ),
    };
  }

  async fetchPoolAccounts(pool: RaydiumPool): Promise<{
    base: TokenAmount;
    quote: TokenAmount;
    lp: TokenAmount;
  }> {
    const splAccounts = await AmmUtils.fetchSplAccounts(
      this.connection,
      [pool.lpMint, pool.baseMint, pool.quoteMint],
      [pool.baseVault, pool.quoteVault]
    );

    const lpMint = splAccounts.mints.shift();
    if (!lpMint) {
      throw new Error(`Failed to fetch lpMint for Raydium pool ${pool.id}`);
    }
    const lp = new TokenAmount(
      BigInt(lpMint.supply.toString()),
      lpMint.decimals
    );

    const baseMint = splAccounts.mints.shift();
    if (!baseMint) {
      throw new Error(`Failed to fetch baseMint for Raydium pool ${pool.id}`);
    }
    const baseVault = splAccounts.accounts.shift();
    if (!baseVault) {
      throw new Error(`Failed to fetch baseVault for Raydium pool ${pool.id}`);
    }
    const base = new TokenAmount(
      BigInt(baseVault.amount.toString()),
      baseMint.decimals
    );

    const quoteMint = splAccounts.mints.shift();
    if (!quoteMint) {
      throw new Error(`Failed to fetch quoteMint for Raydium pool ${pool.id}`);
    }
    const quoteVault = splAccounts.accounts.shift();
    if (!quoteVault) {
      throw new Error(`Failed to fetch quoteVault for Raydium pool ${pool.id}`);
    }
    const quote = new TokenAmount(
      BigInt(quoteVault.amount.toString()),
      quoteMint.decimals
    );

    return { base, quote, lp };
  }
}
