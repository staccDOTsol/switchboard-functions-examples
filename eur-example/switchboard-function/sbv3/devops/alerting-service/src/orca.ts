import * as anchor from "@coral-xyz/anchor";
import type {
  Orca,
  OrcaPool,
  OrcaPoolConfig,
  OrcaPoolToken,
  OrcaToken,
  PoolTokenCount,
} from "@orca-so/sdk";
import type { OrcaU64 } from "@orca-so/sdk";

import { getOrca, getTokenCount } from "@orca-so/sdk";
import { orcaPoolConfigs } from "@orca-so/sdk/dist/constants/pools";
import { usdcToken } from "@orca-so/sdk/dist/constants/tokens";
import type { OrcaPoolParams } from "@orca-so/sdk/dist/model/orca/pool/pool-types";
import { CurveType } from "@orca-so/sdk/dist/model/orca/pool/pool-types";
import type { TokenInfo, WhirlpoolClient } from "@orca-so/whirlpools-sdk";
import {
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PriceMath,
  WhirlpoolContext,
} from "@orca-so/whirlpools-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { Big, BigUtils, BN } from "@switchboard-xyz/common";
import Decimal from "decimal.js";
import * as splI from "@solana/spl-token";
const spl = splI as any;
// import { unpackMint, Mint, Account, unpackAccount } from "@solana/spl-token";
import * as sbv2 from "@switchboard-xyz/solana.js";

export class FailedToFindOrcaPool extends Error {
  constructor(message = "failed to find orca pool") {
    super(message);
    Object.setPrototypeOf(this, FailedToFindOrcaPool.prototype);
  }
}
export function fromOrcaU64(u64: OrcaU64): Big {
  return BigUtils.fromBN(new BN(u64.value.toBuffer()), u64.scale);
}
export class TokenAmount {
  _big?: Big;
  _switchboardDecimal?: sbv2.types.SwitchboardDecimal;
  _bn?: BN;

  constructor(readonly amount: bigint, readonly decimals: number) {}

  toBig(): Big {
    return BigUtils.safeDiv(
      new Big(this.amount.toString()),
      BigUtils.safePow(new Big(10), this.decimals)
    );
  }

  get big(): Big {
    if (!this._big) {
      this._big = this.toBig();
    }
    return this._big;
  }

  get raw(): bigint {
    return this.amount;
  }

  get bn(): BN {
    if (!this._bn) {
      this._bn = new BN(this.amount.toString());
    }
    return this._bn;
  }

  get switchboardDecimal(): sbv2.types.SwitchboardDecimal {
    if (!this._switchboardDecimal) {
      this._switchboardDecimal = new sbv2.types.SwitchboardDecimal({
        mantissa: new BN(this.amount.toString()),
        scale: this.decimals,
      });
    }
    return this._switchboardDecimal;
  }

  toJSON() {
    return {
      amount: this.amount.toString(),
      decimals: this.decimals,
      uiAmount: this.big.toNumber(),
      uiAmountString: this.big.toString(),
    };
  }

  toString() {
    return this.big.toString();
  }

  //   add(b: TokenAmount): TokenAmount {
  //     const scale = Math.max(this.decimals, b.decimals)
  //     const aScaled =
  //   }
}

class StableCurveUtils {
  computeD(amp: number, amounts: bigint[]): bigint {
    // Adapted from @orca-so/stablecurve
    // d = (leverage * sum_x + d_product * n_coins) * initial_d / ((leverage - 1) * initial_d + (n_coins + 1) * d_product)
    const calculateStep = (
      initialD: bigint,
      leverage: number,
      sumX: bigint,
      dProduct: bigint,
      N_COINS: number
    ): bigint => {
      const leverageMul = BigInt(leverage) * sumX;
      const dPMul = dProduct * BigInt(N_COINS);

      const leverageVal = (leverageMul + dPMul) * initialD;

      const leverageSub = initialD * BigInt(leverage - 1);
      const nCoinsSum = dProduct * BigInt(N_COINS + 1);

      const rVal = leverageSub + nCoinsSum;

      return leverageVal / rVal;
    };

    const N_COINS = amounts.length;
    const leverage = amp * N_COINS;
    const amountsTimesN = amounts.map((r) => r * BigInt(N_COINS) + BigInt(1));
    const sumX = amounts.reduce((prev, curr) => prev + curr, BigInt(0));

    if (sumX === BigInt(0)) {
      return BigInt(0);
    }

    let dPrevious: bigint;
    let d = sumX;

    for (let i = 0; i < 32; i++) {
      const dProduct = d;
      amountsTimesN.reduce((prev, curr) => (prev * d) / curr, dProduct);
      dPrevious = d;
      d = calculateStep(d, leverage, sumX, dProduct, N_COINS);
      if (d === dPrevious) {
        break;
      }
    }

    return d;
  }

  calculateVirtualPrice(
    ampFactor: number,
    lpPool: TokenAmount,
    reserves: TokenAmount[]
  ): Big {
    const scale = Math.max(lpPool.decimals, ...reserves.map((r) => r.decimals));
    const normalizedReserves = reserves.map(
      (r) => r.amount * (BigInt(10) ^ BigInt(scale - r.decimals))
    );
    const D = this.computeD(ampFactor, normalizedReserves);

    const virtualPrice = BigUtils.safeDiv(
      BigUtils.safeDiv(
        new Big(D.toString()),
        new Big(lpPool.amount.toString())
      ),
      BigUtils.safePow(new Big(10), scale - lpPool.decimals + 1)
    );

    console.log(
      `${virtualPrice} = ${D} / ${lpPool.amount} / 10^(${
        scale - lpPool.decimals + 1
      })`,
      "StableSwap",
      "VirtualPrice"
    );

    return virtualPrice;
  }

  /**
   * https://blog.chain.link/using-chainlink-oracles-to-securely-utilize-curve-lp-pools/
   * P_LP = P_MIN * P_VIRTUAL
   */
  calculateFairLpPrice(
    ampFactor: number,
    totalSupply: TokenAmount,
    reserves: TokenAmount[],
    prices: Big[]
  ): Big {
    if (reserves.length !== prices.length || reserves.length === 0) {
      throw new Error(
        `must provide equal number of reserves (${reserves.length}) and prices (${prices.length}) to calc fair Lp token price`
      );
    }
    console.log(
      `[${reserves.map((r) => r.toString())}] ${BigUtils.safeMul(
        BigUtils.safeDiv(
          reserves[0].big.mul(prices[0]),
          reserves[0].big.mul(prices[0]).add(reserves[1].big.mul(prices[1]))
        ),
        new Big(100)
      ).toFixed(2)}%`,
      "StableSwap",
      "Reserves"
    );

    const virtualPrice = this.calculateVirtualPrice(
      ampFactor,
      totalSupply,
      reserves
    );

    const sortedPrices = prices.sort((a, b) => a.cmp(b));
    if (!sortedPrices || sortedPrices.length <= 0) {
      throw new Error("EmptyPriceError");
    }
    const minPrice = sortedPrices[0];

    const fairLpPrice = BigUtils.safeMul(minPrice, virtualPrice);

    console.log(
      `${fairLpPrice} = ${minPrice} * ${virtualPrice}`,
      "StableSwap",
      "LpPrice"
    );

    return fairLpPrice;
  }
}

class ConstantProductUtils {
  /*
   * https://blog.alphafinance.io/fair-lp-token-pricing/
   * P_LP = (N * (R1*R2*RN)^1/N * (P1*P2*PN)^1/N) / R_LP
   */
  calculateFairLpPrice(
    totalSupply: TokenAmount,
    reserves: TokenAmount[],
    prices: Big[]
  ): Big {
    if (reserves.length !== prices.length || reserves.length === 0) {
      throw new Error(
        `must provide equal number of reserves (${reserves.length}) and prices (${prices.length}) to calc fair Lp token price`
      );
    }

    console.log(
      `[${reserves.map((r) => r.toString())}] ${BigUtils.safeMul(
        BigUtils.safeDiv(
          reserves[0].big.mul(prices[0]),
          reserves[0].big.mul(prices[0]).add(reserves[1].big.mul(prices[1]))
        ),
        new Big(100)
      ).toFixed(2)}%`,
      "ConstantProduct",
      "Reserves"
    );

    const N = reserves.length;
    const K = BigUtils.safeNthRoot(
      BigUtils.safeMul(...reserves.map((r) => r.big)),
      N
    );
    const P = BigUtils.safeNthRoot(BigUtils.safeMul(...prices), N);
    const numerator = BigUtils.safeMul(new Big(N), K, P);
    const result = BigUtils.safeDiv(numerator, totalSupply.big);

    console.log(
      `${result} = ${N} * (${reserves
        .map((r) => r.big)
        .join("*")})^0.5 * (${prices.join("*")})^0.5 / ${
        totalSupply.big
      } = ${numerator} / ${totalSupply.big}`,
      "ConstantProduct",
      "LpPrice"
    );

    return result;
  }

  /**
   * X * Y = K
   * P = Y / X
   */
  calculateSwapPrice(base: TokenAmount, quote: TokenAmount): Big {
    const swapPrice = BigUtils.safeDiv(quote.big, base.big);
    console.log(
      `${swapPrice} = ${quote.big} / ${base.big}`,
      "ConstantProduct",
      "SwapPrice"
    );
    return swapPrice;
  }
}

export class AmmUtils {
  static stableCurve = new StableCurveUtils();
  static constantProduct = new ConstantProductUtils();

  static async fetchSplAccounts(
    connection: Connection,
    mints?: PublicKey[],
    accounts?: PublicKey[]
  ): Promise<{
    mints: any[];
    accounts: any[];
  }> {
    const allKeys: PublicKey[] = [];
    if (mints && mints.length > 0) {
      allKeys.push(...mints);
    }
    if (accounts && accounts.length > 0) {
      allKeys.push(...accounts);
    }
    if (allKeys.length === 0) {
      throw new Error(`No public keys provided to fetchAccounts`);
    }

    const allAccountInfos = await connection.getMultipleAccountsInfo(allKeys);

    const rawMints: any[] = [];
    const mintAccountInfos = allAccountInfos.slice(0, mints?.length ?? 0);
    if (mintAccountInfos?.length ?? 0) {
      rawMints.push(
        ...mintAccountInfos.map((accountInfo, i) => {
          if (!accountInfo) {
            throw new Error(`Failed to fetch mint`);
          }
          const mint = spl.unpackMint(allKeys[i], accountInfo);
          return mint;
        })
      );
    }

    const accountOffset = mints?.length ?? 0;
    const rawAccounts: any[] = [];
    const accountAccountInfos = allAccountInfos.slice(accountOffset);
    if (accountAccountInfos?.length ?? 0) {
      rawAccounts.push(
        ...accountAccountInfos.map((accountInfo, i) => {
          if (!accountInfo) {
            throw new Error(`Failed to fetch account`);
          }
          const account = spl.unpackAccount(
            allKeys[i + accountOffset],
            accountInfo
          );
          return account;
        })
      );
    }

    return {
      mints: rawMints,
      accounts: rawAccounts,
    };
  }
}

export class OrcaExchange {
  private connection: Connection;

  private orca: Orca;

  private whirlpool: WhirlpoolClient;

  private usdc: OrcaToken = usdcToken;

  constructor(connection: Connection) {
    this.connection = connection;
    this.orca = getOrca(this.connection);
    const whirlpoolCtx = WhirlpoolContext.withProvider(
      new anchor.AnchorProvider(
        this.connection,
        new anchor.Wallet(Keypair.fromSeed(new Uint8Array(32).fill(1))),
        anchor.AnchorProvider.defaultOptions()
      ) as any, // their sdk is using an outdated anchor version
      ORCA_WHIRLPOOL_PROGRAM_ID
    );
    this.whirlpool = buildWhirlpoolClient(whirlpoolCtx);
  }

  /** Return the orca pool and parameters for a given pool address or pool token mint */
  private getPool(
    poolAddress: PublicKey
  ): [OrcaPool, OrcaPoolParams, OrcaPoolToken, OrcaPoolToken] {
    for (const k in orcaPoolConfigs) {
      if (
        poolAddress.equals(orcaPoolConfigs[k].address) ||
        poolAddress.equals(orcaPoolConfigs[k].poolTokenMint)
      ) {
        // const poolConfig = orcaPoolConfigs[k];
        const poolConfig = orcaPoolConfigs[
          k
        ].poolTokenMint.toString() as OrcaPoolConfig;
        const pool = this.orca.getPool(poolConfig);
        const poolParameters = orcaPoolConfigs[poolConfig];
        // need to call here to ensure pool is valid
        const tokenA = pool.getTokenA();
        const tokenB = pool.getTokenB();
        return [pool, poolParameters, tokenA, tokenB];
      }
    }

    throw new FailedToFindOrcaPool();
  }

  /** Calculate the lp token price for a given orca pool */
  public async calculateFairLpTokenPrice(
    poolAddress: PublicKey,
    feedPricesPromise: Promise<Big[]>
  ): Promise<Big> {
    const [pool, poolParameters, tokenA, tokenB] = this.getPool(poolAddress);

    // get current amount of each token in the pool
    const tokenCount = await getTokenCount(
      this.connection,
      poolParameters,
      tokenA,
      tokenB
    );

    switch (poolParameters.curveType) {
      case CurveType.Stable: {
        return this.calculateFairLpTokenPriceStableSwap(
          pool,
          poolParameters,
          tokenCount,
          feedPricesPromise
        );
      }
      default: {
        return this.calculateFairLpTokenPriceConstantProduct(
          pool,
          poolParameters,
          tokenCount,
          feedPricesPromise
        );
      }
    }
  }

  private async calculateFairLpTokenPriceConstantProduct(
    pool: OrcaPool,
    poolParameters: OrcaPoolParams,
    tokenCount: PoolTokenCount,
    feedPricesPromise: Promise<Big[]>
  ): Promise<Big> {
    const tokenA = pool.getTokenA();
    const tokenB = pool.getTokenB();
    const result = AmmUtils.constantProduct.calculateFairLpPrice(
      new TokenAmount(
        BigInt((await pool.getLPSupply()).toU64().toString()),
        poolParameters.poolTokenDecimals
      ),
      [
        new TokenAmount(
          BigInt(tokenCount.inputTokenCount.toString()),
          tokenA.scale
        ),
        new TokenAmount(
          BigInt(tokenCount.outputTokenCount.toString()),
          tokenB.scale
        ),
      ],
      await feedPricesPromise
    );
    return result;
  }

  private async calculateFairLpTokenPriceStableSwap(
    pool: OrcaPool,
    poolParameters: OrcaPoolParams,
    tokenCount: PoolTokenCount,
    feedPricesPromise: Promise<Big[]>
  ): Promise<Big> {
    const tokenA = pool.getTokenA();
    const tokenB = pool.getTokenB();
    if (!poolParameters.amp) {
      throw new Error(
        `StableSwap orca pool needs ampFactor to calculate virtual price`
      );
    }

    return AmmUtils.stableCurve.calculateFairLpPrice(
      poolParameters.amp,
      new TokenAmount(
        BigInt((await pool.getLPSupply()).toU64().toString()),
        poolParameters.poolTokenDecimals
      ),
      [
        new TokenAmount(
          BigInt(tokenCount.inputTokenCount.toString()),
          tokenA.scale
        ),
        new TokenAmount(
          BigInt(tokenCount.outputTokenCount.toString()),
          tokenB.scale
        ),
      ],
      await feedPricesPromise
    );
  }

  /** Calculate the lp token price for a given orca pool */
  public async calculateLpTokenPrice(poolAddress: PublicKey): Promise<Big> {
    const [pool, poolParameters, tokenA, tokenB] = this.getPool(poolAddress);

    // get current amount of each token in the pool
    const tokenCount = await getTokenCount(
      this.connection,
      poolParameters,
      tokenA,
      tokenB
    );

    const numberTokenA = BigUtils.fromBN(
      new BN(tokenCount.inputTokenCount.toBuffer()),
      tokenA.scale
    );
    const numberTokenB = BigUtils.fromBN(
      new BN(tokenCount.outputTokenCount.toBuffer()),
      tokenB.scale
    );

    // get current quote for each token
    const priceA = this.usdc.mint.equals(tokenA.mint)
      ? new Big(1)
      : await this.getOrcaTokenUsdcPrice(tokenA.mint.toString());

    const priceB = this.usdc.mint.equals(tokenB.mint)
      ? new Big(1)
      : await this.getOrcaTokenUsdcPrice(tokenB.mint.toString());

    // calculate LP token price
    const poolLiquidity = BigUtils.safeMul(numberTokenA, priceA).add(
      BigUtils.safeMul(numberTokenB, priceB)
    );
    const supply = fromOrcaU64(await pool.getLPSupply());

    return BigUtils.safeDiv(poolLiquidity, supply);
  }

  // Look in Orca configs for a given base and quote mint address
  public async findPool(
    baseMint: string,
    quoteMint: string
  ): Promise<OrcaPoolConfig> {
    for (const k in orcaPoolConfigs) {
      if (
        orcaPoolConfigs[k].tokenIds.length >= 2 &&
        orcaPoolConfigs[k].tokenIds.includes(baseMint) &&
        orcaPoolConfigs[k].tokenIds.includes(quoteMint)
      ) {
        return k as OrcaPoolConfig;
      }
    }

    throw new FailedToFindOrcaPool();
  }

  /** Return the USDC price for a given orca token */
  public async getOrcaTokenUsdcPrice(baseMint: string): Promise<Big> {
    const poolConfig = await this.findPool(baseMint, this.usdc.mint.toString());
    const pool = this.orca.getPool(poolConfig);
    const quote = await pool.getQuote(
      pool.getTokenA(),
      new Decimal(1), // swap amount of tokenA to tokenB
      new Decimal(0.5) // allowable slippage
    );
    const rate = quote.getRate();
    return BigUtils.fromDecimal(rate);
  }

  /** Calculate the swap price for a given orca lp pool */
  public async calculateSwapPrice(poolAddress: PublicKey): Promise<Big> {
    // calculate swap for normal orca lp pool
    try {
      const args = this.getPool(poolAddress);
      const pool = args[0];
      const tokenA = args[2];

      const quote = await pool.getQuote(
        tokenA,
        new Decimal(1), // swap amount of tokenA to tokenB
        new Decimal(0.5) // allowable slippage
      );
      const rate = quote.getRate();
      return BigUtils.fromDecimal(rate);
    } catch (error: any) {
      if (!(error instanceof FailedToFindOrcaPool)) {
        throw error;
      }
    }
    // calculate swap for whirlpool
    const pool = await this.whirlpool.getPool(poolAddress, { maxAge: 0 });
    if (!pool) {
      throw new Error(`Failed to find Orca LP Pool for ${poolAddress}`);
    }
    const poolData = pool.getData();
    const tokenA: TokenInfo = pool.getTokenAInfo();
    const tokenB: TokenInfo = pool.getTokenBInfo();
    const price = PriceMath.sqrtPriceX64ToPrice(
      poolData.sqrtPrice,
      tokenA.decimals,
      tokenB.decimals
    );

    return BigUtils.fromDecimal(price);
  }
}

(async function main() {
  const url = "https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a";
  let connection = new Connection(url, {});
  let orca = new OrcaExchange(connection);
  let out = await orca.calculateSwapPrice(
    new PublicKey("9XzJpnEti2v4kSf1nGCC4gyysj5wumAve1Fza3sx5eei")
  );
  console.log(out.toString());
})();
