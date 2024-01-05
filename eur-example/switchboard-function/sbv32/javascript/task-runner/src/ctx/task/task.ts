import { TaskError } from "../../errors.js";
import * as tasks from "../../tasks/index.js";
import type { IJobContext, ITask } from "../../types/index.js";
import { TaskResult } from "../../types/index.js";

import { OracleJob } from "@switchboard-xyz/common";

export class Task implements ITask {
  private static _instance: Task;

  private constructor() {}

  public static getInstance(): Task {
    if (!Task._instance) {
      Task._instance = new Task();
    }

    return Task._instance;
  }

  async run(ctx: IJobContext, iTask: OracleJob.ITask): Promise<TaskResult> {
    if (Object.keys(iTask).length === 0) {
      throw new Error(`Invalid OracleJob.ITask`);
    }

    try {
      const task: OracleJob.Task = OracleJob.Task.fromObject(
        ctx.cacheExpand(iTask)
      );

      const taskKey = task.Task;
      if (!taskKey) {
        throw new Error(
          `TaskExecutorError: failed to find handler for ${taskKey}`
        );
      }

      const result = await this[taskKey](ctx, task[taskKey]!);
      return new TaskResult(result);
    } catch (error) {
      if (ctx.isSimulator && process.env.VERBOSE) {
        console.error(error);
      }
      throw new TaskError(iTask, error, ctx.result.toString());
    }
  }

  cacheTask = tasks.cacheTask;

  //////////////////////////////////////////////////////////////////////////////
  ////////////          Web2 Fetch          ////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  httpTask = tasks.httpTask;
  websocketTask = tasks.websocketTask;

  //////////////////////////////////////////////////////////////////////////////
  ////////////          Web3 Fetch          ////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  solanaAccountDataFetchTask = tasks.solanaAccountDataFetchTask;
  anchorFetchTask = tasks.anchorFetchTask;
  oracleTask = tasks.oracleTask;
  jupiterSwapTask = tasks.jupiterSwapTask;
  serumSwapTask = tasks.serumSwapTask;
  uniswapExchangeRateTask = tasks.uniswapExchangeRateTask;
  sushiswapExchangeRateTask = tasks.sushiswapExchangeRateTask;
  pancakeswapExchangeRateTask = tasks.pancakeswapExchangeRateTask;
  defiKingdomsTask = tasks.defiKingdomsTask;
  mangoPerpMarketTask = tasks.mangoPerpMarketTask;
  lendingRateTask = tasks.lendingRateTask;
  xstepPriceTask = tasks.xstepPriceTask;
  splTokenParseTask = tasks.splTokenParseTask;
  splStakePoolTask = tasks.splStakePoolTask;
  lpTokenPriceTask = tasks.lpTokenPriceTask;
  lpExchangeRateTask = tasks.lpExchangeRateTask;

  //////////////////////////////////////////////////////////////////////////////
  ////////////            Parse             ////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  jsonParseTask = tasks.jsonParseTask;
  regexExtractTask = tasks.regexExtractTask;
  bufferLayoutParseTask = tasks.bufferLayoutParseTask;

  //////////////////////////////////////////////////////////////////////////////
  ////////////            Logic             ////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  conditionalTask = tasks.conditionalTask;
  comparisonTask = tasks.comparisonTask;

  //////////////////////////////////////////////////////////////////////////////
  ////////////              MATH          //////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  twapTask = tasks.twapTask;
  ewmaTask = tasks.ewmaTask;
  minTask = tasks.minTask;
  maxTask = tasks.maxTask;
  meanTask = tasks.meanTask;
  medianTask = tasks.medianTask;

  addTask = tasks.addTask;
  subtractTask = tasks.subtractTask;
  multiplyTask = tasks.multiplyTask;
  divideTask = tasks.divideTask;
  powTask = tasks.powTask;
  valueTask = tasks.valueTask;

  //////////////////////////////////////////////////////////////////////////////
  ////////////              UTILS          /////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  tpsTask = tasks.tpsTask;
  sysclockOffsetTask = tasks.sysclockOffsetTask;
  marinadeStateTask = tasks.marinadeStateTask;
  cronParseTask = tasks.cronParseTask;
  perpMarketTask = tasks.perpMarketTask;
  boundTask = tasks.boundTask;
  roundTask = tasks.roundTask;

  //////////////////////////////////////////////////////////////////////////////
  /////////              In progress          //////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////
  historyFunctionTask = NOT_IMPLEMENTED;
  vwapTask = NOT_IMPLEMENTED;
}

export const NOT_IMPLEMENTED = (ctx: IJobContext, iTask: any): string => {
  throw new Error(`Not implemented yet`);
};
