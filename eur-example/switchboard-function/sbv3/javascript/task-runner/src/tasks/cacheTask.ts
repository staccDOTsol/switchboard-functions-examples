import type { IJobContext } from "../types/JobContext.js";
import type { ITaskResult, TaskResult } from "../types/TaskResult.js";

import { OracleJob } from "@switchboard-xyz/common";

/**
 * Execute a job and store the result in a variable to reference later.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iCacheTask] A CacheTask to run.
 * @throws {String}
 * @returns {Promise<ITaskResult>} The current running result
 */
export async function cacheTask(
  ctx: IJobContext,
  iCacheTask: OracleJob.ICacheTask
): Promise<ITaskResult> {
  const task = OracleJob.CacheTask.fromObject(iCacheTask);

  if (!("cacheItems" in task)) {
    throw new Error(
      `No cacheItems found in CacheTask, ${JSON.stringify(task)}`
    );
  }

  // this will throw if any cacheItem fails to resolve
  const cacheItems: {
    variableName: string;
    result: TaskResult;
  }[] = await Promise.all(
    task.cacheItems.map(async (cacheItem) => {
      if (!cacheItem.variableName) {
        throw new Error(`CacheTask: cache item should have a variableName`);
      }
      if (!cacheItem?.job?.tasks || cacheItem?.job?.tasks.length === 0) {
        throw new Error(
          `CacheTask: ${cacheItem.variableName} job should have at least one task`
        );
      }

      const result = await ctx.runSubTasks(cacheItem.job.tasks);
      return {
        variableName: cacheItem.variableName,
        result: result,
      };
    })
  );

  cacheItems.forEach(({ variableName, result }) => {
    ctx.setCache(variableName, result.toString());
    if (ctx.isSimulator && process.env.VERBOSE) {
      console.log(`>> Cache >> ${variableName} = ${result.toString()}`);
    }
  });

  return ctx.result.value;
}
