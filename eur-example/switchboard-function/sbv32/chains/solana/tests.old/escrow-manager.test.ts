import "mocha";

import type { SwitchboardAttestationProgram } from "../target/types/switchboard_attestation_program";
import type { SwitchboardV2 } from "../target/types/switchboard_v2";

import {
  createAttestationQueue,
  createFunction,
  DEFAULT_CREATOR_SEED,
  printLogs,
} from "./v3-utils";

import * as anchor from "@coral-xyz/anchor";
import type { FunctionAccount } from "@switchboard-xyz/solana.js";
import {
  AttestationProgramStateAccount,
  type BootstrappedAttestationQueue,
  NativeMint,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import assert from "assert";

describe("EscrowManager Tests", () => {
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

  let escrowManager: anchor.web3.PublicKey;
  const escrowKeypair = anchor.web3.Keypair.generate();

  let function1: FunctionAccount;
  let function2: FunctionAccount;

  before(async () => {
    switchboardProgram = new SwitchboardProgram(
      sbv2 as any,
      attestationProgram as any,
      "localnet",
      await NativeMint.load(provider as any)
    );

    switchboard = await createAttestationQueue(switchboardProgram);

    await AttestationProgramStateAccount.getOrCreate(switchboardProgram);

    escrowManager = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("EscrowManager"),
        switchboard.attestationQueueAccount.publicKey.toBytes(),
        payer.toBytes(),
        new Uint8Array(DEFAULT_CREATOR_SEED),
      ],
      attestationProgram.programId
    )[0];
  });

  it("Creates an escrow manager", async () => {
    const txn = await attestationProgram.methods
      .escrowManagerInit({
        name: Buffer.from("My Escrow Manager"),
        wrapAmount: null,
        creatorSeed: null,
      })
      .accounts({
        escrowManager: escrowManager,
        authority: payer,
        payer: payer,
        escrow: escrowKeypair.publicKey,
        rewardEscrow: escrowKeypair.publicKey,
        attestationQueue: switchboard.attestationQueueAccount.publicKey,
        state:
          switchboard.attestationQueueAccount.program.attestationProgramState
            .publicKey,
        mint: switchboard.attestationQueueAccount.program.mint.address,
      })
      .signers([escrowKeypair])
      .rpc();

    console.log(`EscrowManager: ${escrowManager}`);

    await printLogs(switchboardProgram.connection, txn);

    const escrowManagerState =
      await attestationProgram.account.escrowManagerAccountData.fetch(
        escrowManager
      );
    assert(
      escrowManagerState.escrowCount === 0,
      "EscrowManager should have an escrow_count of 0"
    );
    assert(
      escrowManagerState.escrow.equals(escrowManagerState.rewardEscrow),
      "EscrowManager escrow should equal its rewardEscrow if a rewards keypair was not provided"
    );
  });

  it("Adds Function #1 to the escrow manager", async () => {
    let functionInit1: string;
    [function1, functionInit1] = await createFunction(switchboard, 1, {
      publicKey: escrowManager,
      authority: authority,
      escrow: escrowKeypair.publicKey,
    });
    console.log(`Function #1: ${function1.publicKey}`);
    await printLogs(switchboardProgram.connection, functionInit1);

    // assert escrow count
    const escrowManagerState =
      await attestationProgram.account.escrowManagerAccountData.fetch(
        escrowManager
      );
    assert(
      escrowManagerState.escrowCount === 1,
      "EscrowManager should have an escrow_count of 1"
    );

    const functionState1 =
      await attestationProgram.account.functionAccountData.fetch(
        function1.publicKey
      );
    assert(
      functionState1.createdAt.toNumber() === 1,
      "FunctionAccount #1 created_at slot should be 1"
    );
    assert(
      new anchor.web3.PublicKey(functionState1.creatorSeed).equals(payer),
      "FunctionAccount #1 creator_seed should equal the payer pubkey"
    );
    assert(
      functionState1.escrow.equals(escrowManagerState.escrow),
      "FunctionAccount #1 should have an escrow pubkey equal to the EscrowManager's escrow"
    );
    assert(
      functionState1.escrowManager.equals(escrowManager),
      "FunctionAccount #1 should have a manager pubkey equal to the EscrowManager"
    );
  });

  it("Adds Function #2 to the escrow manager", async () => {
    let functionInit2: string;
    [function2, functionInit2] = await createFunction(switchboard, 2, {
      publicKey: escrowManager,
      authority: authority,
      escrow: escrowKeypair.publicKey,
    });
    console.log(`Function #2: ${function2.publicKey}`);
    await printLogs(switchboardProgram.connection, functionInit2);

    // assert escrow count
    const escrowManagerState =
      await attestationProgram.account.escrowManagerAccountData.fetch(
        escrowManager
      );
    assert(
      escrowManagerState.escrowCount === 2,
      "EscrowManager should have an escrow_count of 2"
    );

    const functionState2 =
      await attestationProgram.account.functionAccountData.fetch(
        function2.publicKey
      );
    assert(
      functionState2.createdAt.toNumber() === 2,
      "FunctionAccount #1 created_at slot should be 2"
    );
    assert(
      new anchor.web3.PublicKey(functionState2.creatorSeed).equals(payer),
      "FunctionAccount #2 creator_seed should equal the payer pubkey"
    );
    assert(
      functionState2.escrow.equals(escrowManagerState.escrow),
      "FunctionAccount #2 should have an escrow pubkey equal to the EscrowManager's escrow"
    );
    assert(
      functionState2.escrowManager.equals(escrowManager),
      "FunctionAccount #2 should have a manager pubkey equal to the EscrowManager"
    );
  });

  it("Function #2 removes itself from the EscrowManager", async () => {
    const newEscrowKeypair = anchor.web3.Keypair.generate();

    const txn = await attestationProgram.methods
      .functionSetEscrow({})
      .accounts({
        function: function2.publicKey,
        authority: payer,
        payer: payer,
        attestationQueue: switchboard.attestationQueueAccount.publicKey,
        state: switchboardProgram.attestationProgramState.publicKey,
        escrowManager: escrowManager,
        newEscrow: newEscrowKeypair.publicKey,
        newRewardEscrow: null,
        newEscrowManager: null,
        newEscrowManagerAuthority: null,
        mint: switchboardProgram.mint.address,
      })
      .signers([newEscrowKeypair])
      .rpc();

    console.log(`Function #2 setEscrow: ${txn}`);
    await printLogs(switchboardProgram.connection, txn);

    const escrowManagerState =
      await attestationProgram.account.escrowManagerAccountData.fetch(
        escrowManager
      );
    assert(
      escrowManagerState.escrowCount === 1,
      "EscrowManager should have an escrow_count of 1"
    );

    const functionState2 =
      await attestationProgram.account.functionAccountData.fetch(
        function2.publicKey
      );

    assert(
      functionState2.escrow.equals(newEscrowKeypair.publicKey),
      "FunctionAccount #2 should have an escrow pubkey equal to the new escrow keypair"
    );
    assert(
      functionState2.rewardEscrow.equals(newEscrowKeypair.publicKey),
      "FunctionAccount #2 should have a reward_escrow pubkey equal to the new escrow keypair"
    );
  });

  it("Function #2 fails to override its escrow with a new escrow", async () => {
    const newEscrowKeypair = anchor.web3.Keypair.generate();

    await assert.rejects(
      async () => {
        await attestationProgram.methods
          .functionSetEscrow({})
          .accounts({
            function: function2.publicKey,
            authority: payer,
            payer: payer,
            attestationQueue: switchboard.attestationQueueAccount.publicKey,
            state: switchboardProgram.attestationProgramState.publicKey,
            newEscrow: newEscrowKeypair.publicKey,
            escrowManager: null,
            newRewardEscrow: null,
            newEscrowManager: null,
            newEscrowManagerAuthority: null,
            mint: switchboardProgram.mint.address,
          })
          .signers([newEscrowKeypair])
          .rpc();
      }
      // TODO: add expected error message
    );
  });
});
