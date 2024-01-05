import type { IJobContext } from "../types/JobContext.js";
import { jsonReplacers } from "../utils/json.js";

import * as solanaStakePool from "@solana/spl-stake-pool";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Big, BigUtils, OracleJob } from "@switchboard-xyz/common";

/**
 * Fetch the JSON representation of an SPL Stake Pool account.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iSplStakePoolTask] An SplStakePoolTask to run.
 * @throws {String}
 * @returns {Promise<string>} The JSON stringified buffer.
 */
export async function splStakePoolTask(
  ctx: IJobContext,
  iSplStakePoolTask: OracleJob.ISplStakePoolTask
): Promise<string> {
  const task = OracleJob.SplStakePoolTask.fromObject(iSplStakePoolTask);

  const stakeLayout = await solanaStakePool.getStakePoolAccount(
    ctx.solanaMainnetConnection,
    new PublicKey(task.pubkey!)
  );
  const stakePool = stakeLayout.account.data;

  const mintAccountInfo = await ctx.solanaMainnetConnection.getAccountInfo(
    stakePool.poolMint
  );
  if (!mintAccountInfo || mintAccountInfo.data.byteLength === 0) {
    throw new Error(`Failed to fetch mint for ${stakePool.poolMint}`);
  }
  const poolMint = spl.unpackMint(stakePool.poolMint, mintAccountInfo);

  const result = JSON.stringify(
    {
      ...stakePool,
      uiTotalLamports: BigUtils.safeDiv(
        new Big(BigUtils.fromBN(stakePool.totalLamports)),
        BigUtils.safePow(new Big(10), poolMint.decimals)
      ),
      uiPoolTokenSupply: BigUtils.safeDiv(
        new Big(BigUtils.fromBN(stakePool.poolTokenSupply)),
        BigUtils.safePow(new Big(10), poolMint.decimals)
      ),
      uiLastEpochPoolTokenSupply: BigUtils.safeDiv(
        new Big(BigUtils.fromBN(stakePool.lastEpochPoolTokenSupply)),
        BigUtils.safePow(new Big(10), poolMint.decimals)
      ),
      uiLastEpochTotalLamports: BigUtils.safeDiv(
        new Big(BigUtils.fromBN(stakePool.lastEpochTotalLamports)),
        BigUtils.safePow(new Big(10), poolMint.decimals)
      ),
    },
    jsonReplacers
  );

  return result;
}
