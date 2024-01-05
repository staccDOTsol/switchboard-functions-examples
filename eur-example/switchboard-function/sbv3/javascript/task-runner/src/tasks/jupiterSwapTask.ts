import type { IJobContext } from "../types/JobContext.js";

import { Big, OracleJob } from "@switchboard-xyz/common";

/**
 * Return the swap price for a jupiterSwap trade
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iJupiterSwapTask] A JupiterSwapTask to run.
 * @throws {String}
 * @returns {Promise<Big>} A big.js object.
 */
export async function jupiterSwapTask(
  ctx: IJobContext,
  iJupiterSwapTask: OracleJob.IJupiterSwapTask
): Promise<Big> {
  const jupiterSwapTask =
    OracleJob.JupiterSwapTask.fromObject(iJupiterSwapTask);

  ["inTokenAddress", "outTokenAddress"].forEach((field) => {
    if (!(field in jupiterSwapTask) || !jupiterSwapTask[field]) {
      throw new Error(`JupiterSwapTask: Required field '${field}' missing`);
    }
  });

  let swapType: "base" | "quote";
  let swapAmountDecimal: Big;

  if (jupiterSwapTask.baseAmount && jupiterSwapTask.baseAmount > 0) {
    swapType = "base";
    swapAmountDecimal = new Big(jupiterSwapTask.baseAmount);
  } else if (jupiterSwapTask.baseAmountString) {
    swapType = "base";
    swapAmountDecimal = new Big(jupiterSwapTask.baseAmountString);
  } else if (jupiterSwapTask.quoteAmount && jupiterSwapTask.quoteAmount > 0) {
    swapType = "quote";
    swapAmountDecimal = new Big(jupiterSwapTask.quoteAmount);
  } else if (jupiterSwapTask.quoteAmountString) {
    swapType = "quote";
    swapAmountDecimal = new Big(jupiterSwapTask.quoteAmountString);
  } else {
    swapType = "base";
    swapAmountDecimal = new Big(1);
  }

  if (jupiterSwapTask.inTokenAddress && jupiterSwapTask.outTokenAddress) {
    const result = await ctx.clients.jupiter.calculateSwapPrice(
      jupiterSwapTask.inTokenAddress!,
      jupiterSwapTask.outTokenAddress!,
      swapAmountDecimal,
      swapType,
      jupiterSwapTask.allowList?.labels ?? [],
      jupiterSwapTask.denyList?.labels ?? [],
      jupiterSwapTask.slippage
    );

    return result;
  }

  throw new Error("UnexpectedJupiterSwapError");
}
