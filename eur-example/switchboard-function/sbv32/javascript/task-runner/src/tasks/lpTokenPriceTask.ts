import type { IJobContext } from "../types/JobContext.js";

import { PublicKey } from "@solana/web3.js";
import type { Big } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";

/**
 * Find the token price of a LP pool
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iLpTokenPriceTask] An LpTokenPriceTask to run.
 * @throws {String}
 * @returns {Promise<Big>} Big.js object
 */
export async function lpTokenPriceTask(
  ctx: IJobContext,
  iLpTokenPriceTask: OracleJob.ILpTokenPriceTask
): Promise<Big> {
  const lpTokenPriceTask =
    OracleJob.LpTokenPriceTask.fromObject(iLpTokenPriceTask);
  const program = ctx.program;

  if (
    lpTokenPriceTask.useFairPrice === true &&
    lpTokenPriceTask.priceFeedAddresses.length === 0
  ) {
    throw new Error(
      `need to provide priceFeedAddresses if useFairPrice is true`
    );
  }

  if (
    lpTokenPriceTask.useFairPrice === true ||
    lpTokenPriceTask.priceFeedAddresses.length !== 0
  ) {
    const feedPricePromises = ctx.clients.switchboard
      .getFeedsLatestValue(...lpTokenPriceTask.priceFeedAddresses)
      .catch((error: any) => {
        ctx.logger.warn(error);
        return [] as Big[];
      });

    if ((lpTokenPriceTask.mercurialPoolAddress?.length ?? 0) !== 0) {
      return ctx.clients.mercurial.calculateFairLpTokenPrice(
        lpTokenPriceTask.mercurialPoolAddress!,
        feedPricePromises
      );
    } else if ((lpTokenPriceTask.saberPoolAddress?.length ?? 0) !== 0) {
      const pool = new PublicKey(lpTokenPriceTask.saberPoolAddress!);
      return await ctx.clients.saber.calculateFairLpTokenPrice(
        pool,
        feedPricePromises
      );
    } else if ((lpTokenPriceTask.orcaPoolAddress?.length ?? 0) !== 0) {
      const poolAddress = new PublicKey(lpTokenPriceTask.orcaPoolAddress!);
      return await ctx.clients.orca.calculateFairLpTokenPrice(
        poolAddress,
        feedPricePromises
      );
    } else if ((lpTokenPriceTask.raydiumPoolAddress?.length ?? 0) !== 0) {
      const poolAddress = new PublicKey(lpTokenPriceTask.raydiumPoolAddress!);
      return await ctx.clients.raydium.calculateFairLpTokenPrice(
        poolAddress,
        feedPricePromises
      );
    }
  } else {
    if (lpTokenPriceTask.mercurialPoolAddress) {
      return await ctx.clients.mercurial.calculateLpTokenPrice(
        lpTokenPriceTask.mercurialPoolAddress!
      );
    }

    if (lpTokenPriceTask.saberPoolAddress) {
      const poolAddress = new PublicKey(lpTokenPriceTask.saberPoolAddress!);
      return await ctx.clients.saber.calculateLpTokenPrice(poolAddress);
    }

    if (lpTokenPriceTask.orcaPoolAddress) {
      const poolAddress = new PublicKey(lpTokenPriceTask.orcaPoolAddress!);
      return await ctx.clients.orca.calculateLpTokenPrice(poolAddress);
    }

    if (lpTokenPriceTask.raydiumPoolAddress) {
      throw new Error("raydium LpTokenPriceTask needs priceFeedAddresses");
    }
  }

  throw new Error("Invalid LpTokenPriceTask");
}
