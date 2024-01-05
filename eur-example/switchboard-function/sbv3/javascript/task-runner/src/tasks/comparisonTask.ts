import type { IJobContext } from "../types/JobContext.js";
import type { ITaskResult } from "../types/TaskResult.js";

import { Big, OracleJob } from "@switchboard-xyz/common";

/**
 * Perform a comparison between 2 quantitative job outcomes and chain conditionally
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iConditionalTask] A ComparisonTask to run.
 * @throws {String}
 */
export async function comparisonTask(
  ctx: IJobContext,
  iComparisonTask: OracleJob.IComparisonTask
): Promise<ITaskResult> {
  const TAG = `ComparisonTask`;

  let rhs: Big;
  if (iComparisonTask.rhs?.tasks && iComparisonTask.rhs?.tasks.length) {
    const rhsResult = await ctx.runSubTasks(iComparisonTask.rhs?.tasks);
    rhs = rhsResult.big;
  } else if (iComparisonTask.rhsValue) {
    rhs = new Big(iComparisonTask.rhsValue!);
  } else {
    throw new Error(`${TAG}: Right-hand side must be defined`);
  }

  let lhs: Big;
  if (iComparisonTask.lhs?.tasks && iComparisonTask.lhs?.tasks.length) {
    const lhsResult = await ctx.runSubTasks(iComparisonTask.lhs?.tasks);
    lhs = lhsResult.big;
  } else if (iComparisonTask.lhsValue) {
    lhs = new Big(iComparisonTask.lhsValue);
  } else {
    throw new Error(`${TAG}: Left-hand side must be defined`);
  }

  try {
    if (
      iComparisonTask.op === OracleJob.ComparisonTask.Operation.OPERATION_EQ
    ) {
      if (lhs.eq(rhs)) {
        if (
          iComparisonTask!.onTrue!.tasks &&
          iComparisonTask!.onTrue!.tasks.length
        ) {
          const onTrueResult = await ctx.runSubTasks(
            iComparisonTask!.onTrue!.tasks
          );
          return onTrueResult.big;
        } else if (
          iComparisonTask.onTrueValue &&
          iComparisonTask.onTrueValue.length !== 0
        ) {
          return iComparisonTask.onTrueValue;
        }
        throw new Error(`onTrue is not defined`);
      } else {
        if (
          iComparisonTask!.onFalse!.tasks &&
          iComparisonTask!.onFalse!.tasks.length
        ) {
          const onFalseResult = await ctx.runSubTasks(
            iComparisonTask!.onFalse!.tasks
          );
          return onFalseResult.big;
        } else if (
          iComparisonTask.onFalseValue &&
          iComparisonTask.onFalseValue.length
        ) {
          return iComparisonTask.onFalseValue;
        }
        throw new Error(`onFalse is not defined`);
      }
    }
    if (
      iComparisonTask.op === OracleJob.ComparisonTask.Operation.OPERATION_GT
    ) {
      if (lhs.gt(rhs)) {
        if (
          iComparisonTask!.onTrue!.tasks &&
          iComparisonTask!.onTrue!.tasks.length
        ) {
          const onTrueResult = await ctx.runSubTasks(
            iComparisonTask!.onTrue!.tasks
          );
          return onTrueResult.big;
        } else if (
          iComparisonTask.onTrueValue &&
          iComparisonTask.onTrueValue.length !== 0
        ) {
          return iComparisonTask.onTrueValue;
        }
        throw new Error(`onTrue is not defined`);
      } else {
        if (
          iComparisonTask!.onFalse!.tasks &&
          iComparisonTask!.onFalse!.tasks.length
        ) {
          const onFalseResult = await ctx.runSubTasks(
            iComparisonTask!.onFalse!.tasks
          );
          return onFalseResult.big;
        } else if (
          iComparisonTask.onFalseValue &&
          iComparisonTask.onFalseValue.length
        ) {
          return iComparisonTask.onFalseValue;
        }
        throw new Error(`onFalse is not defined`);
      }
    }
    if (
      iComparisonTask.op === OracleJob.ComparisonTask.Operation.OPERATION_LT
    ) {
      if (lhs.lt(rhs)) {
        if (
          iComparisonTask!.onTrue!.tasks &&
          iComparisonTask!.onTrue!.tasks.length
        ) {
          const onTrueResult = await ctx.runSubTasks(
            iComparisonTask!.onTrue!.tasks
          );
          return onTrueResult.big;
        } else if (
          iComparisonTask.onTrueValue &&
          iComparisonTask.onTrueValue.length !== 0
        ) {
          return iComparisonTask.onTrueValue;
        }
        throw new Error(`onTrue is not defined`);
      } else {
        if (
          iComparisonTask!.onFalse?.tasks &&
          iComparisonTask!.onFalse?.tasks.length
        ) {
          const onFalseResult = await ctx.runSubTasks(
            iComparisonTask!.onFalse!.tasks
          );
          return onFalseResult.big;
        } else if (
          iComparisonTask.onFalseValue &&
          iComparisonTask.onFalseValue.length
        ) {
          return iComparisonTask.onFalseValue;
        }
        throw new Error(`onFalse is not defined`);
      }
    }
  } catch (error: any) {}

  if (
    iComparisonTask.onFailure?.tasks &&
    iComparisonTask.onFailure.tasks.length
  ) {
    const onFailureResult = await ctx.runSubTasks(
      iComparisonTask.onFailure.tasks
    );
    return onFailureResult.big;
  } else if (
    iComparisonTask.onFailureValue &&
    iComparisonTask.onFailureValue.length !== 0
  ) {
    return iComparisonTask.onFailureValue;
  }

  throw new Error(`onFailure is not defined`);
}
