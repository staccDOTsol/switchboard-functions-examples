import type { IJobContext } from "../types/JobContext.js";

import type { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";

/**
 * Fetch the current transactions per second.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iTpsTask] A TpsTask to run.
 * @throws {String}
 * @returns {Promise<Big>} The current transactions per second
 */
export async function tpsTask(
  ctx: IJobContext,
  iTpsTask: OracleJob.ITpsTask
): Promise<Big> {
  const sample = (
    await (ctx.program.provider.connection as any)._rpcRequest(
      "getRecentPerformanceSamples",
      [1]
    )
  ).result[0];
  return new Big(sample.numTransactions / sample.samplePeriodSecs);
}
