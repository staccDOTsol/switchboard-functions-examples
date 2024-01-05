import type { IJobContext } from "../types/JobContext.js";

import { Big, OracleJob } from "@switchboard-xyz/common";
import type { AssetRate, Protocol } from "@switchboard-xyz/defi-yield-ts";

/**
 * Fetch the lending rates for various Solana protocols
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iLendingRateTask] An LendingRateTask to run.
 * @throws {String}
 * @returns {Promise<Big>} Big.js object
 */
export async function lendingRateTask(
  ctx: IJobContext,
  iLendingRateTask: OracleJob.ILendingRateTask
): Promise<Big> {
  const task = OracleJob.LendingRateTask.fromObject(iLendingRateTask);
  const rates = (
    await ctx.clients.lendingRateObserver.fetch(
      task.protocol as Protocol,
      ctx.solanaMainnetConnection
    )
  ).rates;
  const assetRate = rates.find(
    (assetRate: AssetRate) => assetRate.mint.toBase58() === task.assetMint
  );
  if (assetRate === undefined) {
    throw new Error("LendingRateTaskAssetNotFoundError");
  }
  if (task.field === OracleJob.LendingRateTask.Field.FIELD_DEPOSIT_RATE) {
    if (assetRate.depositRate === undefined) {
      throw new Error("LendingRateTaskAssetDepositRateNotFoundError");
    }
    return new Big(assetRate.depositRate);
  } else {
    if (assetRate.borrowRate === undefined) {
      throw new Error("LendingRateTaskAssetBorrowRateNotFoundError");
    }
    return new Big(assetRate.borrowRate);
  }
}
