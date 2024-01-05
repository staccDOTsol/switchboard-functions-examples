import type { IJobContext } from "../types/JobContext.js";
import type { ITaskResult } from "../types/TaskResult.js";
import { BufferReader } from "../utils/BufferReader.js";

import { OracleJob } from "@switchboard-xyz/common";

/**
 * Return the deserialized value from a stringified buffer.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iBufferLayoutParseTask] An AnchorFetchTask to run.
 * @throws {String}
 * @returns {ITaskResult}
 */
export function bufferLayoutParseTask(
  ctx: IJobContext,
  iBufferLayoutParseTask: OracleJob.IBufferLayoutParseTask
): ITaskResult {
  const bufferLayoutTask = OracleJob.BufferLayoutParseTask.fromObject(
    iBufferLayoutParseTask
  );
  const reader = BufferReader.fromString(ctx.result.toString());
  const result = reader.decode(bufferLayoutTask);
  return result;
}
