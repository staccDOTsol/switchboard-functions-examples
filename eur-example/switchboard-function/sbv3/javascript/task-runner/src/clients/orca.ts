import { AmmUtils, fromOrcaU64, TokenAmount } from "../utils/index.js";

import * as anchor from "@coral-xyz/anchor";
import type {
  Orca,
  OrcaPool,
  OrcaPoolConfig,
  OrcaPoolToken,
  OrcaToken,
  PoolTokenCount,
} from "@orca-so/sdk";
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
import type { Connection, PublicKey } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { Big, BigUtils, BN } from "@switchboard-xyz/common";
import Decimal from "decimal.js";

export class FailedToFindOrcaPool extends Error {
  constructor(message = "failed to find orca pool") {
    super(message);
    Object.setPrototypeOf(this, FailedToFindOrcaPool.prototype);
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
    const pool = await this.whirlpool.getPool(poolAddress, true);
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
