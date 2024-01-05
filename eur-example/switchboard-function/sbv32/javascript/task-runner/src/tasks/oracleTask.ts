import type { IJobContext } from "../types/JobContext.js";

import type { Big } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";

/**
 * Retrieve the latest value for a given oracle.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iOracleTask] An OracleTask to run.
 * @throws {String}
 * @returns {Promise<Big>} The latest result from the oracle
 */
export async function oracleTask(
  ctx: IJobContext,
  iOracleTask: OracleJob.IOracleTask
): Promise<Big> {
  const task = OracleJob.OracleTask.fromObject(iOracleTask);

  switch (task.AggregatorAddress) {
    case "switchboardAddress": {
      return ctx.clients.switchboard.getFeedLatestValue(
        task.switchboardAddress!
      );
    }
    case "pythAddress": {
      return ctx.clients.pyth.getOraclePrice(
        task.pythAddress!,
        task.pythAllowedConfidenceInterval
      );
    }
    case "chainlinkAddress": {
      return ctx.clients.chainlink.getOraclePrice(task.chainlinkAddress!);
    }
    default:
      throw new Error("OracleTaskError");
  }
}
