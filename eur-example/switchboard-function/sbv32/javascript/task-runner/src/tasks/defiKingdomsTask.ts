import type { IJobContext } from "../types/JobContext.js";

import { JsonRpcProvider } from "@ethersproject/providers";
import { Big, OracleJob } from "@switchboard-xyz/common";
import {
  ChainId,
  Fetcher,
  Pair,
  Route,
  Token as DefiKingdomsToken,
  TokenAmount,
  Trade,
} from "@switchboard-xyz/defikingdoms-sdk";
import JSBI from "jsbi";

/**
 * Fetch the swap price from DefiKingdoms.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iDefiKingdomsTask] An DefiKingdomsTask to run.
 * @throws {String}
 * @returns {Promise<Big>} big.js instance
 */
export async function defiKingdomsTask(
  ctx: IJobContext,
  iDefiKingdomsTask: OracleJob.IDefiKingdomsTask
): Promise<Big> {
  const task = OracleJob.DefiKingdomsTask.fromObject(iDefiKingdomsTask);
  const provider = new JsonRpcProvider(task.provider, {
    chainId: ChainId.HARMONY_MAINNET,
    name: "",
  });
  const inToken = new DefiKingdomsToken(
    ChainId.HARMONY_MAINNET,
    task.inToken!.address!,
    task.inToken!.decimals!,
    "",
    ""
  );
  const outToken = new DefiKingdomsToken(
    ChainId.HARMONY_MAINNET,
    task.outToken!.address!,
    task.outToken!.decimals!,
    "",
    ""
  );
  const pAddr = Pair.getAddress(inToken, outToken);
  // console.log(pAddr, "0xA1221A5BBEa699f507CC00bDedeA05b5d2e32Eba");
  const pair = [await Fetcher.fetchPairData(inToken, outToken, provider)];
  const route = new Route(pair, inToken, outToken);
  const trade = Trade.exactIn(
    route,
    new TokenAmount(
      inToken,
      String(JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(inToken.decimals)))
    )
  );
  return new Big(trade.outputAmount.toFixed());
}
