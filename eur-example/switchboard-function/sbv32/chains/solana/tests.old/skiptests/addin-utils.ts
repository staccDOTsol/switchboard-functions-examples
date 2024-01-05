import * as anchor from "@coral-xyz/anchor";
import {
  SystemProgram,
  PublicKey,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import { IDL as sbIdl } from "../../target/types/switchboard_v2";

export async function initializeAddin(
  program: anchor.Program,
  grantAuthority: PublicKey,
  revokeAuthority: PublicKey,
  payer: Keypair
): Promise<PublicKey> {
  let [addinState, _] = await PublicKey.findProgramAddress(
    [Buffer.from("state")],
    program.programId
  );

  await program.methods
    .initialize(grantAuthority, revokeAuthority)
    .accounts({
      state: addinState,
      payer: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();

  return addinState;
}

export async function grantPermissionTx(
  program: anchor.Program,
  grantAuthority: PublicKey,
  switchboardProgram: PublicKey,
  permission: PublicKey
): Promise<Transaction> {
  const sbProgram = new anchor.Program(sbIdl, switchboardProgram);

  let [addinState] = await PublicKey.findProgramAddress(
    [Buffer.from("state")],
    program.programId
  );

  return await program.methods
    .grantPermission()
    .accounts({
      state: addinState,
      grantAuthority: grantAuthority,
      switchboardProgram: switchboardProgram,
      permission: permission,
    })
    .transaction();
}
