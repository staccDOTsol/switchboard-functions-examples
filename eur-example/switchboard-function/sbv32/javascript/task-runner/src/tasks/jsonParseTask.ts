import { TaskRunnerWorker } from "../ctx/worker/index.js";
import type { IJobContext } from "../types/JobContext.js";
import type { ITaskResult } from "../types/TaskResult.js";
import { toString } from "../utils/misc.js";

import { Big, BigUtils, OracleJob } from "@switchboard-xyz/common";
import { JSONPath } from "jsonpath-plus";

const TAG = "JsonParse";

/**
 * Produces a result after having run an JsonParse task.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iJsonParseTask] An JsonParseTask to run.
 * @throws {String}
 * @returns {Promise<string>} A big.js object.
 */
export async function jsonParseTask(
  ctx: IJobContext,
  iJsonParseTask: OracleJob.IJsonParseTask
): Promise<ITaskResult> {
  const worker = TaskRunnerWorker.getInstance();
  const input = ctx.result.toString();
  if (!input || input === "") {
    throw new Error(`JsonParseTask: No input provided`);
  }

  const task = OracleJob.JsonParseTask.fromObject(iJsonParseTask);

  if (!task.path) {
    throw new Error(`${TAG}: Path is not defined.`);
  }

  const results: ITaskResult[] = [];
  if (worker.enabled && worker.jsonPathEnabled) {
    const workerResult = await TaskRunnerWorker.getInstance().jsonPathArray(
      task.path!,
      input
    );
    const rArray: Array<any> = JSON.parse(workerResult);
    results.push(...rArray.map((r) => toString(r)));
  } else {
    JSONPath({
      json: JSON.parse(input),
      path: iJsonParseTask.path!,
      callback: (val) => results.push(toString(val)),
    });
  }

  const finalResult = handleJsonPathResult(task, results);
  return finalResult;
}

function handleJsonPathResult(
  task: OracleJob.JsonParseTask,
  results: Array<ITaskResult>
): ITaskResult {
  const result = results.map((r) => (typeof r === "string" ? new Big(r) : r));

  switch (task.aggregationMethod) {
    case OracleJob.JsonParseTask.AggregationMethod.MIN:
      return result.reduce(
        (val, current) => (val.lt(current) ? val : current),
        result[0]
      );
    case OracleJob.JsonParseTask.AggregationMethod.MAX:
      return result.reduce(
        (val, current) => (val.gt(current) ? val : current),
        result[0]
      );
    case OracleJob.JsonParseTask.AggregationMethod.SUM:
      return result.reduce((sum, current) => sum.add(current), new Big(0));
    case OracleJob.JsonParseTask.AggregationMethod.MEAN:
      return BigUtils.safeDiv(
        result.reduce((sum, current) => sum.add(current), new Big(0)),
        new Big(result.length)
      );
    case OracleJob.JsonParseTask.AggregationMethod.MEDIAN:
      return BigUtils.median(result);
    case OracleJob.JsonParseTask.AggregationMethod.NONE:
    default:
      if (result.length !== 1) {
        throw new Error(
          `${TAG}: An AggregationMethod should be provided to consolidate a final result when parsing more than 1 result (${JSON.stringify(
            result
          )})`
        );
      }

      if (result[0] === null || result[0] === undefined) {
        throw new Error(`${TAG}: Invalid value from jsonParseTask`);
      }
      return toString(result[0]);
  }
}
