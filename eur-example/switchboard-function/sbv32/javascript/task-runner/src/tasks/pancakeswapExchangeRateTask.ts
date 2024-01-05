import type { IJobContext } from "../types/JobContext.js";

import { Big, OracleJob, promiseWithTimeout } from "@switchboard-xyz/common";
import * as pancake from "simple-pancakeswap-sdk";

/**
 * Fetch the swap price from PancakeSwap.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iPancakeswapExchangeRateTask] A PancakeswapExchangeRateTask to run.
 * @throws {String}
 * @returns {Promise<Big>} The latest swap price
 */
export async function pancakeswapExchangeRateTask(
  ctx: IJobContext,
  iPancakeswapExchangeRateTask: OracleJob.IPancakeswapExchangeRateTask
): Promise<Big> {
  const task = OracleJob.PancakeswapExchangeRateTask.fromObject(
    iPancakeswapExchangeRateTask
  );
  const pair = new pancake.PancakeswapPair({
    fromTokenContractAddress: task.inTokenAddress,
    toTokenContractAddress: task.outTokenAddress,
    // the ethereum address of the user (dummy)
    ethereumAddress: "0xB1E6079212888f0bE0cf55874B2EB9d7a5e02cD9",
    providerUrl: task.provider,
    // "https://mainnet.infura.io/v3/a34093308cf04a8ea2bdef517961b59e",
    settings: new pancake.PancakeswapPairSettings({
      slippage: task.slippage,
      deadlineMinutes: 20,
      disableMultihops: false,
    }),
  });
  const pairFactory = await pair.createFactory();
  const pancakeswapTradeContext = await promiseWithTimeout(
    7500,
    pairFactory.trade(task.inTokenAmount.toString()),
    "Timed out waiting for PancakeSwap trade"
  );
  return new Big(pancakeswapTradeContext.expectedConvertQuote);
}
