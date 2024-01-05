import type { IJobContext } from "../types/JobContext.js";

import { Big, OracleJob, promiseWithTimeout } from "@switchboard-xyz/common";
import * as sushi from "simple-sushiswap-sdk";

/**
 * Fetch the swap price from SushiSwap.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iSushiswapExchangeRateTask] A SushiswapExchangeRateTask to run.
 * @throws {String}
 * @returns {Promise<Big>} The latest swap price
 */
export async function sushiswapExchangeRateTask(
  ctx: IJobContext,
  iSushiswapExchangeRateTask: OracleJob.ISushiswapExchangeRateTask
): Promise<Big> {
  const task = OracleJob.SushiswapExchangeRateTask.fromObject(
    iSushiswapExchangeRateTask
  );
  const pair = new sushi.SushiswapPair({
    fromTokenContractAddress: task.inTokenAddress,
    toTokenContractAddress: task.outTokenAddress,
    // the ethereum address of the user (dummy)
    ethereumAddress: "0xB1E6079212888f0bE0cf55874B2EB9d7a5e02cD9",
    chainId: sushi.ChainId.MAINNET,
    providerUrl: task.provider,
    // "https://mainnet.infura.io/v3/a34093308cf04a8ea2bdef517961b59e",
    settings: new sushi.SushiswapPairSettings({
      slippage: task.slippage,
      deadlineMinutes: 20,
      disableMultihops: false,
    }),
  });
  const pairFactory = await pair.createFactory();
  const sushiswapTradeContext = await promiseWithTimeout(
    7500,
    pairFactory.trade(task.inTokenAmount.toString()),
    "Timed out waiting for SushiSwap trade"
  );
  return new Big(sushiswapTradeContext.expectedConvertQuote);
}
