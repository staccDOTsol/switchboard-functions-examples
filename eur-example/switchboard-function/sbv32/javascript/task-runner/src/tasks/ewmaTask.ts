import type { IJobContext } from "../types/JobContext.js";
import { ema } from "../utils/ema.js";

import type { Big } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";
import * as sbv2 from "@switchboard-xyz/solana.js";

const TAG = `EwmaTask`;

/**
 * Takes a exponential moving average over a set period for a given aggregator.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iEwmaTask] An EwmaTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function ewmaTask(
  ctx: IJobContext,
  iEwmaTask: OracleJob.IEwmaTask
): Promise<Big> {
  const ewmaTask = OracleJob.EwmaTask.fromObject(iEwmaTask);

  const lambda = ewmaTask.lambda!;
  if (!lambda) {
    throw new Error(`${TAG}: 'lambda' is not defined`);
  }
  if (lambda <= 0 || lambda > 1) {
    throw new Error(`${TAG}: 'lambda' should be between 0 and 1`);
  }

  const period = ewmaTask.period!;
  if (!period) {
    throw new Error(`${TAG}: 'period' is not defined`);
  }

  const aggregatorAccount = new sbv2.AggregatorAccount(
    ctx.program,
    ewmaTask.aggregatorAddress
  );
  const history = await aggregatorAccount.loadHistory();

  const result = ema(history, lambda, period);
  return result;
}
