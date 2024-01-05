import type { SwitchboardProgram } from "../../../SwitchboardProgram.js";
import * as types from "../types/index.js"; // eslint-disable-line @typescript-eslint/no-unused-vars

import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { AccountMeta, PublicKey } from "@solana/web3.js";
import { TransactionInstruction } from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { BN } from "@switchboard-xyz/common"; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface FunctionSetEscrowArgs {
  params: types.FunctionSetEscrowParamsFields;
}

export interface FunctionSetEscrowAccounts {
  function: PublicKey;
  authority: PublicKey;
  attestationQueue: PublicKey;
  escrowWallet: PublicKey;
  escrowAuthority: PublicKey;
  newEscrow: PublicKey;
  newEscrowAuthority: PublicKey;
  newEscrowTokenWallet: PublicKey;
}

export const layout = borsh.struct([
  types.FunctionSetEscrowParams.layout("params"),
]);

export function functionSetEscrow(
  program: SwitchboardProgram,
  args: FunctionSetEscrowArgs,
  accounts: FunctionSetEscrowAccounts,
  programId: PublicKey = program.attestationProgramId
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.function, isSigner: false, isWritable: true },
    { pubkey: accounts.authority, isSigner: true, isWritable: false },
    { pubkey: accounts.attestationQueue, isSigner: false, isWritable: false },
    { pubkey: accounts.escrowWallet, isSigner: false, isWritable: true },
    { pubkey: accounts.escrowAuthority, isSigner: false, isWritable: false },
    { pubkey: accounts.newEscrow, isSigner: false, isWritable: true },
    { pubkey: accounts.newEscrowAuthority, isSigner: true, isWritable: false },
    {
      pubkey: accounts.newEscrowTokenWallet,
      isSigner: false,
      isWritable: false,
    },
  ];
  const identifier = Buffer.from([63, 223, 123, 191, 23, 84, 113, 198]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      params: types.FunctionSetEscrowParams.toEncodable(args.params),
    },
    buffer
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
