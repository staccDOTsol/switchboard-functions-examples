import type { IJobContext } from "../types/JobContext.js";

import { Big, OracleJob } from "@switchboard-xyz/common";

/**
 * Round the running result
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iRoundTask] A RoundTask to run.
 * @throws {String}
 * @returns {Big} A big.js object.
 */
export const roundTask = async (
  ctx: IJobContext,
  iRoundTask: OracleJob.IRoundTask
): Promise<Big> => {
  // Convert task to JSON to remove any default values that might come with it.
  const task = OracleJob.RoundTask.create(iRoundTask);

  const input = ctx.result.big;

  const dp = task.decimals;
  const mode = task.method;

  if (mode === OracleJob.RoundTask.Method.METHOD_ROUND_DOWN) {
    return input.round(dp, Big.roundDown);
  } else {
    return input.round(dp, Big.roundUp);
  }
};
