import type { IJobContext } from "../types/JobContext.js";

import {
  StakedStepMarketSource,
  STEP_MINT,
  XSTEP_MINT,
} from "@stepfinance/solana-market-aggregator/dist/sources/index.js";
import { Big, OracleJob } from "@switchboard-xyz/common";

/**
 * Fetch the price for price of xSTEP/USD
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iXStepPriceTask] An XStepPriceTask to run.
 * @throws {String}
 * @returns {Promise<Big>} The current price of xSTEP/USD
 */
export async function xstepPriceTask(
  ctx: IJobContext,
  iXStepPriceTask: OracleJob.IXStepPriceTask
): Promise<Big> {
  const task = OracleJob.XStepPriceTask.create(iXStepPriceTask);

  const fetchPrice = async (stepPrice: Big): Promise<Big> => {
    if (stepPrice === null) {
      throw new Error("AggregatorEmptyError");
    }
    const stakedStepMarketSource = new StakedStepMarketSource(
      ctx.solanaMainnetConnection
    );
    return stakedStepMarketSource
      .query({
        [STEP_MINT]: {
          address: STEP_MINT,
          source: "Switchboard",
          symbol: "STEP",
          price: stepPrice.toNumber(),
        },
      })
      .then((result) => new Big(result[XSTEP_MINT].price));
  };

  switch (task.StepSource) {
    case "stepAggregatorPubkey": {
      const feedResult = await ctx.clients.switchboard.getFeedLatestValue(
        task.stepAggregatorPubkey!
      );
      return await fetchPrice(feedResult);
    }
    case "stepJob": {
      const result = await ctx.task.medianTask(ctx, task.stepJob!);
      return await fetchPrice(
        typeof result === "string"
          ? new Big(result.toString().replace(/"/g, ""))
          : new Big(result)
      );
    }
    default:
      throw new Error("UnexpectedXStepPriceError");
  }
}
