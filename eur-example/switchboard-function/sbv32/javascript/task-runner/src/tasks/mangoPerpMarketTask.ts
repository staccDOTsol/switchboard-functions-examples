import type { IJobContext } from "../types/JobContext.js";

import type { Big } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";

/**
 * Fetch the current price for a Mango perpetual market
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iMangoPerpMarketTask] A MangoPerpMarketTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function mangoPerpMarketTask(
  ctx: IJobContext,
  iMangoPerpMarketTask: OracleJob.IMangoPerpMarketTask
): Promise<Big> {
  const task = OracleJob.MangoPerpMarketTask.fromObject(iMangoPerpMarketTask);
  return ctx.clients.mango.calculatePerpPrice(task.perpMarketAddress);
}
