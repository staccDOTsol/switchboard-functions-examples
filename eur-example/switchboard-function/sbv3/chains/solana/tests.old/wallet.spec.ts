import "mocha";

import type { SwitchboardAttestationProgram } from "../target/types/switchboard_attestation_program";
import type { SwitchboardV2 } from "../target/types/switchboard_v2";

import {
  createAttestationQueue,
  printLogs,
  roundNum,
  SwitchboardWallet,
} from "./v3-utils";

import * as anchor from "@coral-xyz/anchor";
import { sleep } from "@switchboard-xyz/common";
import {
  AttestationProgramStateAccount,
  type BootstrappedAttestationQueue,
  NativeMint,
  parseRawBuffer,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import assert from "assert";

const defaulWalletSeed = "DefaultSeed";
// const defaultName: Array<number> = Array(32).fill(0);

describe("SwitchboardWallet Tests", () => {
  const provider = anchor.AnchorProvider.env();
  const payer = provider.publicKey;
  const authority = (provider.wallet as anchor.Wallet).payer;

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const sbv2 = anchor.workspace.SwitchboardV2 as anchor.Program<SwitchboardV2>;
  const attestationProgram = anchor.workspace
    .SwitchboardAttestationProgram as anchor.Program<SwitchboardAttestationProgram>;

  let switchboardProgram: SwitchboardProgram;
  let switchboard: BootstrappedAttestationQueue;

  let switchboardWallet: SwitchboardWallet;

  before(async () => {
    switchboardProgram = new SwitchboardProgram(
      sbv2 as any,
      attestationProgram as any,
      "localnet",
      await NativeMint.load(provider as any)
    );

    switchboard = await createAttestationQueue(switchboardProgram);

    await AttestationProgramStateAccount.getOrCreate(switchboardProgram);
  });

  it("Creates a SwitchboardWallet", async () => {
    let walletInitSignature: string;
    [switchboardWallet, walletInitSignature] = await SwitchboardWallet.create(
      switchboardProgram,
      switchboard.attestationQueue.publicKey,
      payer,
      defaulWalletSeed
    );

    const name = parseRawBuffer(defaulWalletSeed, 32);

    await printLogs(switchboardProgram.connection, walletInitSignature);

    const walletState = await switchboardWallet.loadData();

    assert(
      walletState.mint.equals(switchboardProgram.mint.address),
      "MintPubkeyMismatch"
    );
    assert(
      walletState.attestationQueue.equals(
        switchboard.attestationQueue.publicKey
      ),
      "QueuePubkeyMismatch"
    );
    assert(walletState.authority.equals(payer), "AuthorityPubkeyMismatch");
    assert(
      Buffer.compare(Buffer.from(name), Buffer.from(walletState.name)) === 0,
      "WalletNameMismatch"
    );
  });

  it("Deposits into a Switchboard Wallet", async () => {
    const payerTokenWallet = (
      await switchboardProgram.mint.getOrCreateWrappedUser(
        switchboardProgram.walletPubkey,
        { fundUpTo: 0.5 }
      )
    )[0];
    const depositTxnSignature = await switchboardWallet.fund({
      transferAmount: 0.15,
      funderTokenWallet: payerTokenWallet,
    });
    // await printLogs(switchboardProgram.connection, depositTxnSignature);

    const balance = await switchboardWallet.getBalance();
    assert(balance === 0.15, "WalletBalanceMismatch");
  });

  it("Withdraws from a Switchboard Wallet", async () => {
    const initialBalance = await switchboardWallet.getBalance();

    const withdrawTxnSignature = await switchboardWallet.withdraw(0.05);
    await printLogs(switchboardProgram.connection, withdrawTxnSignature);

    const balance = await switchboardWallet.getBalance();
    const diff = roundNum(initialBalance - balance, 4);
    assert(diff === 0.05, "WalletBalanceMismatch");
  });

  it("Wraps SOL into a Switchboard Wallet", async () => {
    const initialBalance = await switchboardWallet.getBalance();

    const wrapTxnSignature = await switchboardWallet.wrap(0.25);
    // await printLogs(switchboardProgram.connection, wrapTxnSignature);

    const balance = await switchboardWallet.getBalance();
    const diff = roundNum(balance - initialBalance, 4);
    assert(diff === 0.25, "WalletBalanceMismatch");
  });
});
