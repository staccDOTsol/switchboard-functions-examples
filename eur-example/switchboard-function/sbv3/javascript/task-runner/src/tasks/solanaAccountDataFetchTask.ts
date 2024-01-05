import type { IJobContext } from "../types/JobContext.js";
import { jsonReplacers } from "../utils/json.js";

import { PublicKey } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";

/**
 * Fetch the data for a Solana account and return the stringified buffer
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iSolanaAccountDataFetchTask] An SolanaAccountDataFetchTask to run.
 * @throws {String}
 * @returns {Promise<string>} The JSON stringified buffer.
 */
export async function solanaAccountDataFetchTask(
  ctx: IJobContext,
  iSolanaAccountDataFetchTask: OracleJob.ISolanaAccountDataFetchTask
): Promise<string> {
  const task = OracleJob.SolanaAccountDataFetchTask.fromObject(
    iSolanaAccountDataFetchTask
  );
  const pubkey = new PublicKey(task.pubkey!);
  const accountInfo = await ctx.solanaMainnetConnection.getAccountInfo(pubkey);
  if (!accountInfo || !accountInfo.data) {
    throw new Error(
      `Failed to fetch AccountInfo for ${iSolanaAccountDataFetchTask.pubkey}`
    );
  }

  const accountStr = JSON.stringify(accountInfo.data, jsonReplacers);

  return accountStr;
}
