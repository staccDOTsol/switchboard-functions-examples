import type { IJobContext } from "../types/JobContext.js";
import type { ITaskResult } from "../types/TaskResult.js";

import { Big, OracleJob } from "@switchboard-xyz/common";

/**
 * Deserialize an anchor account and return its account struct
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iAnchorFetchTask] An AnchorFetchTask to run.
 * @throws {String}
 * @returns {Promise<string>} The stringified JSON representation of the on-chain account.
 */
export async function boundTask(
  ctx: IJobContext,
  iBoundTask: OracleJob.IBoundTask
): Promise<ITaskResult> {
  const input = ctx.result.big;
  if (!input) {
    throw new Error(`numeric input required, received undefined`);
  }
  const task = OracleJob.BoundTask.fromObject(iBoundTask);

  // throw new Error(`boundTask is not implemented`);

  const runTasks = async (tasks: OracleJob.ITask[]): Promise<Big> => {
    const job = OracleJob.fromObject({ tasks });
    const result = await ctx.perform(ctx.jobKey, job, ctx.new());
    if ("error" in result) {
      throw result.error;
    }
    return result.result;
  };

  let lowerBound: Big | undefined = undefined;
  if (iBoundTask.lowerBound?.tasks && iBoundTask!.lowerBound!.tasks?.length) {
    const lowerBoundResult = await runTasks(iBoundTask.lowerBound!.tasks);
    lowerBound =
      typeof lowerBoundResult === "string"
        ? new Big(lowerBoundResult)
        : lowerBoundResult;
  } else if (
    iBoundTask!.lowerBoundValue &&
    iBoundTask!.lowerBoundValue!.length !== 0
  ) {
    lowerBound = new Big(iBoundTask.lowerBoundValue);
  }

  if (lowerBound !== undefined && input.lt(lowerBound)) {
    // check if theres a job to run when exceeded
    if (
      iBoundTask.onExceedsLowerBound?.tasks &&
      iBoundTask.onExceedsLowerBound!.tasks!.length
    ) {
      const result = await runTasks(iBoundTask.onExceedsLowerBound!.tasks);
      const resultBig = typeof result === "string" ? new Big(result) : result;
      return resultBig;
    } else if (
      iBoundTask.onExceedsLowerBoundValue &&
      iBoundTask.onExceedsLowerBoundValue!.length !== 0
    ) {
      return new Big(iBoundTask.onExceedsLowerBoundValue);
    } else {
      throw new Error(
        `Lower bound exceeded with no handler, result: ${ctx.result}, lowerBound: ${lowerBound}`
      );
    }
  }

  let upperBound: Big | undefined = undefined;
  if (iBoundTask.upperBound?.tasks && iBoundTask.upperBound.tasks?.length) {
    const upperBoundResult = await runTasks(iBoundTask.upperBound.tasks);
    upperBound =
      typeof upperBoundResult === "string"
        ? new Big(upperBoundResult)
        : upperBoundResult;
  } else if (
    iBoundTask.upperBoundValue &&
    iBoundTask.upperBoundValue.length !== 0
  ) {
    upperBound = new Big(iBoundTask.upperBoundValue);
  }

  if (upperBound !== undefined && input.gt(upperBound!)) {
    // check if theres a job to run when exceeded
    if (
      iBoundTask.onExceedsUpperBound?.tasks &&
      iBoundTask.onExceedsUpperBound!.tasks!.length
    ) {
      const result = await runTasks(iBoundTask!.onExceedsUpperBound!.tasks!);
      const resultBig = typeof result === "string" ? new Big(result) : result;
      return resultBig;
    } else if (
      iBoundTask.onExceedsUpperBoundValue &&
      iBoundTask.onExceedsUpperBoundValue.length !== 0
    ) {
      return new Big(iBoundTask.onExceedsUpperBoundValue);
    } else {
      throw new Error(
        `Upper bound exceeded with no handler, result: ${input}, upperBound: ${upperBound}`
      );
    }
  }

  return input;
}
