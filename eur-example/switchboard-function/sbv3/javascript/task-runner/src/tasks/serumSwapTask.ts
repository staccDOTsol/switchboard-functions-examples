import type { IJobContext } from "../types/JobContext.js";

import type { Big } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";

/**
 * Fetch the latest swap price on Serum's orderbook
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iSerumSwapTask] An SerumSwapTask to run.
 * @throws {String}
 * @returns {Promise<Big>} The latest result from the oracle
 */
export async function serumSwapTask(
  ctx: IJobContext,
  iSerumSwapTask: OracleJob.ISerumSwapTask
): Promise<Big> {
  const serumTask = OracleJob.SerumSwapTask.fromObject(iSerumSwapTask);

  if (!serumTask.serumPoolAddress) {
    throw new Error("UnexpectedSerumSwapError");
  }
  return ctx.clients.serum.calculateSwapPrice(serumTask.serumPoolAddress);
}
