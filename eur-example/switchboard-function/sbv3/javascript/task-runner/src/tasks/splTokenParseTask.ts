import type { IJobContext } from "../types/JobContext.js";
import { jsonReplacers } from "../utils/json.js";

import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Big, BigUtils, OracleJob } from "@switchboard-xyz/common";

/**
 * Fetch the JSON representation of an SPL token mint.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iSplTokenParseTask] An SplTokenParseTask to run.
 * @throws {String}
 * @returns {Promise<string>} The JSON stringified buffer.
 */
export async function splTokenParseTask(
  ctx: IJobContext,
  iSplTokenParseTask: OracleJob.ISplTokenParseTask
): Promise<string> {
  const task = OracleJob.SplTokenParseTask.fromObject(iSplTokenParseTask);

  if (task.AccountAddress === "mintAddress") {
    const mintAddress = new PublicKey(task.mintAddress!);

    const mintAccountInfo = await ctx.solanaMainnetConnection.getAccountInfo(
      mintAddress
    );
    if (!mintAccountInfo || mintAccountInfo.data.byteLength === 0) {
      throw new Error(`Failed to fetch mint for ${mintAddress}`);
    }
    const mint = spl.unpackMint(mintAddress, mintAccountInfo);

    const result = JSON.stringify(
      {
        ...mint,
        uiSupply: BigUtils.safeDiv(
          new Big(mint.supply.toString()),
          BigUtils.safePow(new Big(10), mint.decimals)
        ),
      },
      jsonReplacers
    );
    return result;
  }

  if (task.AccountAddress === "tokenAccountAddress") {
    const accountAddress = new PublicKey(task.tokenAccountAddress!);

    const tokenAccountInfo = await ctx.solanaMainnetConnection.getAccountInfo(
      accountAddress
    );
    if (!tokenAccountInfo || tokenAccountInfo.data.byteLength === 0) {
      throw new Error(`Failed to fetch token account for ${accountAddress}`);
    }
    const account: spl.Account = spl.unpackAccount(
      accountAddress,
      tokenAccountInfo
    );

    const mintAccountInfo = await ctx.solanaMainnetConnection.getAccountInfo(
      account.mint
    );
    if (!mintAccountInfo || mintAccountInfo.data.byteLength === 0) {
      throw new Error(`Failed to fetch mint for ${account.mint}`);
    }
    const mint: spl.Mint = spl.unpackMint(account.mint, mintAccountInfo);
    const result = JSON.stringify(
      {
        ...account,
        uiAmount: BigUtils.safeDiv(
          new Big(account.amount.toString()),
          BigUtils.safePow(new Big(10), mint.decimals)
        ),
        mintInfo: {
          ...mint,
          uiSupply: BigUtils.safeDiv(
            new Big(mint.supply.toString()),
            BigUtils.safePow(new Big(10), mint.decimals)
          ),
        },
      },
      jsonReplacers
    );
    return result;
  }

  throw new Error("UnexpectedSplTokenParseTaskError");
}
