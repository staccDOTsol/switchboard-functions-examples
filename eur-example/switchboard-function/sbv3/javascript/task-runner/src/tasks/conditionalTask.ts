import type { IJobContext } from "../types/JobContext.js";

import type { Big, OracleJob } from "@switchboard-xyz/common";

/**
 * Perform a conditional task and return a big.js
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iConditionalTask] A ConditionalTask to run.
 * @throws {String}
 * @returns {Promise<Big>} A big.js instance
 */
export async function conditionalTask(
  ctx: IJobContext,
  iConditionalTask: OracleJob.IConditionalTask
): Promise<Big> {
  const TAG = `ConditionalTask`;

  if (!iConditionalTask.attempt) {
    throw new Error(`${TAG}: No 'attempt' tasks provided.`);
  }
  if (!iConditionalTask.onFailure) {
    throw new Error(`${TAG}: No 'onFailure' tasks provided.`);
  }

  let response: Big;
  try {
    // Try to produce an acceptable response using the `attempt` subtasks.
    const result = await ctx.runSubTasks(iConditionalTask.attempt);
    response = result.big;
  } catch (error: any) {
    // If `attempt` subtasks don't produce an acceptable response, try the `onFailure` subtasks.
    const result = await ctx.runSubTasks(iConditionalTask.onFailure);
    response = result.big;
  }
  return response;
}
