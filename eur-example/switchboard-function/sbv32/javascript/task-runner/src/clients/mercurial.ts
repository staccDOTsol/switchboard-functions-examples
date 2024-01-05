import type { Connection } from "@solana/web3.js";
import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Big, BigUtils, BN } from "@switchboard-xyz/common";
import {
  findLogAndParse,
  getSimulateSwapInstructions,
  StableSwapNPool,
} from "@switchboard-xyz/mercurial-stable-swap-n-pool";

export class MercurialSwap {
  // Used by mercurial when simulating a txn to calc if any new token accounts are needed
  static simulatedUser = new PublicKey(
    "D8d7xsLgV3sHxXQacA1vQfCharFXQzVmSeyMcHEenP52"
  );

  public connection: Connection;

  constructor(mainnetConnection: Connection) {
    this.connection = mainnetConnection;
  }

  public async calculateVirtualPrice(
    poolAddress: string
    // feedPricesPromise: Promise<Big[]>
  ): Promise<Big> {
    const hgPool = await StableSwapNPool.load(
      this.connection,
      new PublicKey(poolAddress),
      MercurialSwap.simulatedUser
    );

    const { virtualPrice } = await hgPool.getVirtualPrice();
    return new Big(virtualPrice);
  }

  // https://www.chainlinkecosystem.com/ecosystem/curve/
  /** Calculate the lp token price for a given mercurial pool */
  public async calculateFairLpTokenPrice(
    poolAddress: string,
    feedPricesPromise: Promise<Big[]>
  ): Promise<Big> {
    const hgPool = await StableSwapNPool.load(
      this.connection,
      new PublicKey(poolAddress),
      MercurialSwap.simulatedUser
    );

    const pFactor = 10 ** hgPool.precisionFactor;
    const { virtualPrice } = await hgPool.getVirtualPrice();
    const vPrice: Big = BigUtils.safeDiv(
      new Big(virtualPrice),
      new Big(pFactor)
    );

    let prices: Big[];
    try {
      prices = await feedPricesPromise;
      if (prices.length !== hgPool.tokenAccounts.length) {
        throw new Error(
          `Incorrect number of prices. Expected ${hgPool.tokenAccounts.length}, Received ${prices.length}`
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

  /** Calculate the lp token price for a given mercurial pool */
  public async calculateLpTokenPrice(poolAddress: string): Promise<Big> {
    const hgPool = await StableSwapNPool.load(
      this.connection,
      new PublicKey(poolAddress),
      MercurialSwap.simulatedUser
    );

    const pFactor = 10 ** hgPool.precisionFactor;
    const { virtualPrice } = await hgPool.getVirtualPrice();

    return BigUtils.safeDiv(new Big(virtualPrice), new Big(pFactor));
  }

  /** Calculate the lp token price for a given mercurial pool */
  public async calculateSwapPrice(
    poolAddress: string,
    inKey: string,
    outKey: string
  ): Promise<Big> {
    const hgPool = await StableSwapNPool.load(
      this.connection,
      new PublicKey(poolAddress),
      MercurialSwap.simulatedUser
    );

    const inAmountBN = new BN(1000000000);

    const messageV0 = new TransactionMessage({
      payerKey: MercurialSwap.simulatedUser,
      recentBlockhash: "9xZZhtobUCxoyXTSu741omVXZRHPbinZraj32Qr9mQT", // lazy
      instructions: getSimulateSwapInstructions(
        hgPool,
        new PublicKey(inKey),
        new PublicKey(outKey),
        MercurialSwap.simulatedUser,
        inAmountBN
      ),
    }).compileToLegacyMessage();
    const transaction = new VersionedTransaction(messageV0);
    const simulationResult = await this.connection.simulateTransaction(
      transaction,
      { replaceRecentBlockhash: true, sigVerify: false }
    );

    const { value } = simulationResult;
    const result: { dy: number } | null = findLogAndParse(
      value.logs && value.logs.length ? value.logs : null,
      "GetDyUnderlying"
    );

    if (result === null || !("dy" in result && typeof result.dy === "number")) {
      throw new Error("Failed to fetch out amount");
    }

    return BigUtils.safeDiv(new Big(result.dy), new Big(inAmountBN.toString()));
  }
}
