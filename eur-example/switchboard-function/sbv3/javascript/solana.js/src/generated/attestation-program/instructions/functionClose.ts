import type { SwitchboardProgram } from "../../../SwitchboardProgram.js";
import * as types from "../types/index.js"; // eslint-disable-line @typescript-eslint/no-unused-vars

import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { AccountMeta, PublicKey } from "@solana/web3.js";
import { TransactionInstruction } from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { BN } from "@switchboard-xyz/common"; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface FunctionCloseArgs {
  params: types.FunctionCloseParamsFields;
}

export interface FunctionCloseAccounts {
  function: PublicKey;
  authority: PublicKey;
  addressLookupTable: PublicKey;
  escrowWallet: PublicKey;
  solDest: PublicKey;
  escrowDest: PublicKey;
  tokenProgram: PublicKey;
  systemProgram: PublicKey;
  addressLookupProgram: PublicKey;
}

export const layout = borsh.struct([
  types.FunctionCloseParams.layout("params"),
]);

export function functionClose(
  program: SwitchboardProgram,
  args: FunctionCloseArgs,
  accounts: FunctionCloseAccounts,
  programId: PublicKey = program.attestationProgramId
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.function, isSigner: false, isWritable: true },
    { pubkey: accounts.authority, isSigner: true, isWritable: false },
    { pubkey: accounts.addressLookupTable, isSigner: false, isWritable: true },
    { pubkey: accounts.escrowWallet, isSigner: false, isWritable: true },
    { pubkey: accounts.solDest, isSigner: false, isWritable: false },
    { pubkey: accounts.escrowDest, isSigner: false, isWritable: true },
    { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    {
      pubkey: accounts.addressLookupProgram,
      isSigner: false,
      isWritable: false,
    },
  ];
  const identifier = Buffer.from([94, 164, 174, 42, 156, 29, 244, 236]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      params: types.FunctionCloseParams.toEncodable(args.params),
    },
    buffer
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
