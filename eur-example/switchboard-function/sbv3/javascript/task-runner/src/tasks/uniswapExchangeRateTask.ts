import type { IJobContext } from "../types/JobContext.js";

import { Big, OracleJob, promiseWithTimeout } from "@switchboard-xyz/common";
import * as uni from "simple-uniswap-sdk";

/**
 * Fetch the swap price from Uniswap.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iUniswapExchangeRateTask] A UniswapExchangeRateTask to run.
 * @throws {String}
 * @returns {Promise<Big>} The latest swap price
 */
export async function uniswapExchangeRateTask(
  ctx: IJobContext,
  iUniswapExchangeRateTask: OracleJob.IUniswapExchangeRateTask
): Promise<Big> {
  const task = OracleJob.UniswapExchangeRateTask.fromObject(
    iUniswapExchangeRateTask
  );
  const uniswapPair = new uni.UniswapPair({
    fromTokenContractAddress: task.inTokenAddress,
    toTokenContractAddress: task.outTokenAddress,
    // the ethereum address of the user (dummy)
    ethereumAddress: "0xB1E6079212888f0bE0cf55874B2EB9d7a5e02cD9",
    chainId: uni.ChainId.MAINNET,
    providerUrl: task.provider,
    // "https://mainnet.infura.io/v3/a34093308cf04a8ea2bdef517961b59e",
    settings: new uni.UniswapPairSettings({
      slippage: task.slippage,
      deadlineMinutes: 20,
      disableMultihops: false,
      uniswapVersions: [uni.UniswapVersion.v2, uni.UniswapVersion.v3],
    }),
  });
  const uniswapPairFactory = await uniswapPair.createFactory();
  const uniswapTradeContext = await promiseWithTimeout(
    7500,
    uniswapPairFactory.trade(task.inTokenAmount.toString()),
    "Timed out waiting for Uniswap trade"
  );
  return new Big(uniswapTradeContext.expectedConvertQuote);
}
