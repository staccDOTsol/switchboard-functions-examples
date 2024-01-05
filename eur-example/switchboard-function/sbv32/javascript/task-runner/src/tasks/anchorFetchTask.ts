import type { IJobContext } from "../types/JobContext.js";
import { jsonReplacers } from "../utils/json.js";

import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";

/**
 * Deserialize an anchor account and return its account struct
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iAnchorFetchTask] An AnchorFetchTask to run.
 * @throws {String}
 * @returns {Promise<string>} The stringified JSON representation of the on-chain account.
 */
export async function anchorFetchTask(
  ctx: IJobContext,
  iAnchorFetchTask: OracleJob.IAnchorFetchTask
): Promise<string> {
  const task = OracleJob.AnchorFetchTask.fromObject(iAnchorFetchTask);

  const provider = new anchor.AnchorProvider(
    ctx.solanaMainnetConnection,
    new anchor.Wallet(Keypair.fromSeed(new Uint8Array(32).fill(1))),
    anchor.AnchorProvider.defaultOptions()
  );

  const accountInfo = await ctx.solanaMainnetConnection.getAccountInfo(
    new PublicKey(iAnchorFetchTask.accountAddress!)
  );

  const programId = new PublicKey(accountInfo!.owner!); // could also use task definition

  if (!ctx.cache.hasAnchorIdl(programId.toBase58())) {
    const anchorIdl = await anchor.Program.fetchIdl(programId, provider);
    if (!anchorIdl) {
      throw new Error(`failed to fetch Idl for ${iAnchorFetchTask.programId}`);
    }

    ctx.cache.setAnchorIdl(programId.toBase58(), anchorIdl, {
      ttl: 12 * 60 * 60 * 1000,
    });
  }

  const idl = ctx.cache.getAnchorIdl(programId.toBase58())!;
  const clientProgram = new anchor.Program(idl!, programId, provider);
  const coder = new anchor.BorshAccountsCoder(clientProgram.idl);

  // find account type by discriminator
  const accountTypeDef = clientProgram.idl.accounts!.find((accountDef) =>
    anchor.BorshAccountsCoder.accountDiscriminator(accountDef.name).equals(
      accountInfo!.data.slice(0, 8)
    )
  );
  if (!accountTypeDef) {
    throw new Error(
      `failed to find account type for anchor account ${task.accountAddress}`
    );
  }

  const account = coder.decode(accountTypeDef.name, accountInfo!.data);

  return JSON.stringify(account, jsonReplacers);
}
