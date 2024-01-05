import type { IJobContext } from "../types/JobContext.js";
import type { ITaskResult } from "../types/TaskResult.js";

import { Big, BigUtils, OracleJob } from "@switchboard-xyz/common";

/**
 *
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iAddTask] An AddTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function addTask(
  ctx: IJobContext,
  iAddTask: OracleJob.IAddTask
): Promise<Big> {
  const input = ctx.result.big;
  if (input === undefined) {
    throw new Error(`AddTask: No input provided`);
  }

  const addTask = OracleJob.AddTask.fromObject(iAddTask);
  let result: Big | null = null;

  switch (addTask.Addition) {
    case "scalar": {
      const scalar: number = addTask.scalar!;
      result = new Big(scalar);
      break;
    }
    case "aggregatorPubkey": {
      result = await ctx.clients.switchboard.getFeedLatestValue(
        addTask.aggregatorPubkey!
      );
      break;
    }
    case "job": {
      const receipt = await ctx.runSubJob(addTask.job!);
      result = receipt.result;
      break;
    }
    case "big": {
      result = new Big(addTask.big ?? 0);
      break;
    }
    default:
      throw new Error(`UnexpectedAdditionError`);
  }

  if (result === null) {
    throw new Error("UnexpectedAdditionError");
  }

  return input.add(result);
}

/**
 *
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iSubtractTask] A SubtractTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function subtractTask(
  ctx: IJobContext,
  iSubtractTask: OracleJob.ISubtractTask
): Promise<Big> {
  const input = ctx.result.big;
  if (input === undefined) {
    throw new Error(`SubtractTask: No input provided`);
  }

  const subtractTask = OracleJob.SubtractTask.fromObject(iSubtractTask);
  let result: Big | null = null;

  switch (subtractTask.Subtraction) {
    case "scalar": {
      const scalar: number = subtractTask.scalar!;
      result = new Big(scalar);
      break;
    }
    case "aggregatorPubkey": {
      result = await ctx.clients.switchboard.getFeedLatestValue(
        subtractTask.aggregatorPubkey!
      );
      break;
    }
    case "job": {
      const receipt = await ctx.runSubJob(subtractTask.job!);
      result = receipt.result;
      break;
    }
    case "big": {
      result = new Big(subtractTask.big ?? 0);
      break;
    }
    default:
      throw new Error(`UnexpectedSubtractionError`);
  }

  if (result === null) {
    throw new Error("");
  }

  return input.sub(result);
}

/**
 * Produces a big.js result after multiplying the input by the task definition.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iMultiplyTask] A MultiplyTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function multiplyTask(
  ctx: IJobContext,
  iMultiplyTask: OracleJob.IMultiplyTask
): Promise<Big> {
  const input = ctx.result.big;
  if (input === undefined) {
    throw new Error(`MultiplyTask: No input provided`);
  }

  const multiplyTask = OracleJob.MultiplyTask.fromObject(iMultiplyTask);
  let result: Big | null = null;

  switch (multiplyTask.Multiple) {
    case "scalar": {
      result = new Big(multiplyTask.scalar ?? 1);
      break;
    }
    case "aggregatorPubkey": {
      result = await ctx.clients.switchboard.getFeedLatestValue(
        multiplyTask.aggregatorPubkey!
      );
      break;
    }
    case "job": {
      const receipt = await ctx.runSubJob(multiplyTask.job!);
      result = receipt.result;
      break;
    }
    case "big": {
      result = new Big(multiplyTask.big ?? 0);
      break;
    }
    default:
      throw new Error(`UnexpectedMultiplicationError`);
  }

  if (result === null) {
    throw new Error("UnexpectedMultiplicationError");
  }

  return input.mul(result);
}

/**
 * Produces a big.js result after dividing the input by the task definition.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iDivideTask] A DivideTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function divideTask(
  ctx: IJobContext,
  iDivideTask: OracleJob.IDivideTask
): Promise<Big> {
  const input = ctx.result.big;
  if (input === undefined) {
    throw new Error(`DivideTask: No input provided`);
  }

  const divideTask = OracleJob.DivideTask.fromObject(iDivideTask);
  let result: Big | null = null;

  switch (divideTask.Denominator) {
    case "scalar": {
      result = new Big(divideTask.scalar ?? 1);
      break;
    }
    case "aggregatorPubkey": {
      result = await ctx.clients.switchboard.getFeedLatestValue(
        divideTask.aggregatorPubkey!
      );
      break;
    }
    case "job": {
      const receipt = await ctx.runSubJob(divideTask.job!);
      result = receipt.result;
      break;
    }
    case "big": {
      result = new Big(divideTask.big ?? 0);
      break;
    }
    default:
      throw new Error(`UnexpectedMultiplicationError`);
  }

  if (result === null) {
    throw new Error("UnexpectedMultiplicationError");
  }

  return BigUtils.safeDiv(input, result);
}

/**
 * Produces a result after taking the exponent of an input
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iPowTask] A PowTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function powTask(
  ctx: IJobContext,
  iPowTask: OracleJob.IPowTask
): Promise<Big> {
  const input = ctx.result.big;
  if (input === undefined) {
    throw new Error(`PowTask: No input provided`);
  }

  const powTask = OracleJob.PowTask.fromObject(iPowTask);

  switch (powTask.Exponent) {
    case "scalar": {
      return BigUtils.safePow(input, powTask.scalar ?? 1);
    }
    case "aggregatorPubkey": {
      const feed = await ctx.clients.switchboard.getFeedLatestValue(
        powTask.aggregatorPubkey!
      );
      return BigUtils.safePow(input, feed.toNumber());
    }
    case "big": {
      return BigUtils.safePow(input, new Big(powTask.big ?? 1).toNumber());
    }
    default:
      throw new Error("UnexpectedPowError");
  }
}

// TODO: Should this fail open on some failures? Might be annoying for lp token price stuff
// Where we are ok with some failures
/**
 * Produces a result after taking the median of a list
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iMedianTask] A MedianTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function medianTask(
  ctx: IJobContext,
  iMedianTask: OracleJob.IMedianTask
): Promise<Big> {
  const TAG = `MedianTask`;
  const medianTask = OracleJob.MedianTask.fromObject(iMedianTask);
  // this will not throw if an item fails to resolve
  const itemResults = await ctx.runSubJobsAndTasks(medianTask);
  const items: Array<Big> = itemResults.map(
    (r: ITaskResult): Big =>
      typeof r === "string" ? new Big(r.replace(/"/g, "")) : r
  );

  if (items.length < medianTask.minSuccessfulRequired) {
    throw new Error(`${TAG}: minimum required results threshold not met.`);
  }

  const med = BigUtils.median(items);
  if (med === null || med === undefined) {
    throw new Error(
      `${TAG}: Failed to find median of task: ${JSON.stringify(medianTask)}`
    );
  }
  return med;
}

/**
 * Produces a result after taking the mean of a list
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iMeanTask] A MeanTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function meanTask(
  ctx: IJobContext,
  iMeanTask: OracleJob.IMeanTask
): Promise<Big> {
  const TAG = `MeanTask`;
  const meanTask = OracleJob.MeanTask.create(iMeanTask);
  // this will not throw if an item fails to resolve
  const itemResults = await ctx.runSubJobsAndTasks(meanTask);
  const items: Array<Big> = itemResults.map(
    (r: ITaskResult): Big =>
      typeof r === "string" ? new Big(r.replace(/"/g, "")) : r
  );

  if (!items.length) {
    throw new Error(
      `${TAG}: Failed to find mean of task: ${JSON.stringify(iMeanTask)}`
    );
  }
  return BigUtils.safeDiv(
    items.reduce((prev, cur) => prev.add(cur), new Big(0)),
    new Big(items.length)
  );
}

/**
 * Produces a result after taking the max of a list
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iMaxTask] A MaxTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function maxTask(
  ctx: IJobContext,
  iMaxTask: OracleJob.IMaxTask
): Promise<Big> {
  const TAG = `MaxTask`;
  const maxTask = OracleJob.MaxTask.fromObject(iMaxTask);
  // this will not throw if an item fails to resolve
  const itemResults = await ctx.runSubJobsAndTasks(maxTask);
  const items: Array<Big> = itemResults.map(
    (r: ITaskResult): Big =>
      typeof r === "string" ? new Big(r.replace(/"/g, "")) : r
  );

  if (!items.length) {
    throw new Error(`${TAG}: Failed to find max of task: ${iMaxTask}`);
  }
  return items.reduce(
    (val, current) => (val.gt(current) ? val : current),
    items[0]
  );
}

/**
 * Produces a result after taking the min of a list
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iMinTask] A MinTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function minTask(
  ctx: IJobContext,
  iMinTask: OracleJob.IMinTask
): Promise<Big> {
  const TAG = `MinTask`;
  const minTask = OracleJob.MaxTask.fromObject(iMinTask);
  // this will not throw if an item fails to resolve
  const itemResults = await ctx.runSubJobsAndTasks(minTask);
  const items: Array<Big> = itemResults.map(
    (r: ITaskResult): Big =>
      typeof r === "string" ? new Big(r.replace(/"/g, "")) : r
  );

  if (!items.length) {
    throw new Error(`${TAG}: Failed to find max of task: ${iMinTask}`);
  }
  return items.reduce(
    (val, current) => (val.lt(current) ? val : current),
    items[0]
  );
}
