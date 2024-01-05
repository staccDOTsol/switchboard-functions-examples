/* eslint-disable no-unused-vars */
import "mocha";

import type { SwitchboardAttestationProgram } from "../target/types/switchboard_attestation_program";

import { Switchboard } from "./utils/switchboard";
import {
  createFunction,
  debugLog,
  functionMrEnclave,
  getSwitchboardWalletPubkeys,
  nativeMint,
  printLogs,
} from "./utils/utils";

import type { Program } from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { BN, sleep } from "@switchboard-xyz/common";
import { type AnchorWallet } from "@switchboard-xyz/solana.js";
import assert from "assert";

describe("Routine Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const _program: Program<SwitchboardAttestationProgram> =
    anchor.workspace.SwitchboardAttestationProgram;

  const payer = (provider.wallet as AnchorWallet).payer;
  const payerTokenWallet = anchor.utils.token.associatedAddress({
    mint: nativeMint,
    owner: payer.publicKey,
  });
  const authority = payer;

  let switchboard: Switchboard<SwitchboardAttestationProgram>;

  before(async () => {
    switchboard = await Switchboard.initialize(_program);
  });

  /**
   * Test the function can provide access control to routines
   * - routinesDisabled: prevents routine creation from all accounts
   * - routinesRequireAuthorization: prevents routine creation from non-authority accounts
   */
  describe("FunctionRoutine AccessControl", () => {
    // payer 1
    let disabledFunctionRoutinePubkey: PublicKey;
    // payer 2
    let permissionedFunctionPubkey: PublicKey;

    before(async () => {
      [disabledFunctionRoutinePubkey] = await createFunction(
        switchboard.program1,
        switchboard.defaultQueue.publicKey,
        "Function_RoutinesDisabledTests",
        {
          routinesDisabled: true,
          authority: switchboard.payer1,
        }
      );

      [permissionedFunctionPubkey] = await createFunction(
        switchboard.program2,
        switchboard.defaultQueue.publicKey,
        "Function_RoutineAuthorizationTests",
        {
          routinesRequireAuthorization: true,
          authority: switchboard.payer2,
        }
      );
    });

    it("Fails to create a routine if function authority disabled routines", async () => {
      // using payer3 to create a routine for a function that has routines disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const routineKeypair = Keypair.generate();

      const [escrowWallet, escrowTokenWallet] = getSwitchboardWalletPubkeys(
        program,
        switchboard.defaultQueue.publicKey,
        payer.publicKey,
        routineKeypair.publicKey
      );

      await assert.rejects(async () => {
        const txn = await program.methods
          .functionRoutineInit({
            // Metadata
            name: Buffer.from(""),
            metadata: Buffer.from(""),
            // Fees
            bounty: new BN(0),
            // Execution
            schedule: Buffer.from("* * * * * *"),
            maxContainerParamsLen: 256,
            containerParams: Buffer.from(""),
          })
          .accounts({
            routine: routineKeypair.publicKey,
            authority: payer.publicKey,
            function: disabledFunctionRoutinePubkey,
            functionAuthority: null,
            escrowWallet: escrowWallet,
            escrowTokenWallet: escrowTokenWallet,
            escrowWalletAuthority: null,
            mint: nativeMint,
            attestationQueue: switchboard.defaultQueue.publicKey,
            payer: payer.publicKey,
          })
          .signers([routineKeypair])
          .rpc();
      }, new RegExp(/FunctionRoutinesDisabled|The function authority has disabled routine execution for this function/g));
    });

    it("Fails to create a routine if function authority disabled routines and fn authority signs", async () => {
      // using payer3 to create a routine for a function that has routines disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const routineKeypair = Keypair.generate();

      const [escrowWallet, escrowTokenWallet] = getSwitchboardWalletPubkeys(
        program,
        switchboard.defaultQueue.publicKey,
        payer.publicKey,
        routineKeypair.publicKey
      );

      await assert.rejects(async () => {
        const txn = await program.methods
          .functionRoutineInit({
            // Metadata
            name: Buffer.from(""),
            metadata: Buffer.from(""),
            // Fees
            bounty: new BN(0),
            // Execution
            schedule: Buffer.from("* * * * * *"),
            maxContainerParamsLen: 256,
            containerParams: Buffer.from(""),
          })
          .accounts({
            routine: routineKeypair.publicKey,
            authority: payer.publicKey,
            function: disabledFunctionRoutinePubkey,
            functionAuthority: switchboard.payer1.publicKey,
            escrowWallet: escrowWallet,
            escrowTokenWallet: escrowTokenWallet,
            escrowWalletAuthority: null,
            mint: nativeMint,
            attestationQueue: switchboard.defaultQueue.publicKey,
            payer: payer.publicKey,
          })
          .signers([routineKeypair, switchboard.payer1])
          .rpc();
      }, new RegExp(/FunctionRoutinesDisabled|The function authority has disabled routine execution for this function/g));
    });

    it("Fails to create a routine if function authority set routinesRequireAuthorization and didnt sign", async () => {
      // using payer3 to create a routine for a function that has routines disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const routineKeypair = Keypair.generate();

      const [escrowWallet, escrowTokenWallet] = getSwitchboardWalletPubkeys(
        program,
        switchboard.defaultQueue.publicKey,
        payer.publicKey,
        routineKeypair.publicKey
      );

      await assert.rejects(async () => {
        const txn = await program.methods
          .functionRoutineInit({
            // Metadata
            name: Buffer.from(""),
            metadata: Buffer.from(""),
            // Fees
            bounty: new BN(0),
            // Execution
            schedule: Buffer.from("* * * * * *"),
            maxContainerParamsLen: 256,
            containerParams: Buffer.from(""),
          })
          .accounts({
            routine: routineKeypair.publicKey,
            authority: payer.publicKey,
            function: disabledFunctionRoutinePubkey,
            functionAuthority: null,
            escrowWallet: escrowWallet,
            escrowTokenWallet: escrowTokenWallet,
            escrowWalletAuthority: null,
            mint: nativeMint,
            attestationQueue: switchboard.defaultQueue.publicKey,
            payer: payer.publicKey,
          })
          .signers([routineKeypair])
          .rpc();
      }, new RegExp(/FunctionRoutinesDisabled|The function authority has disabled routine execution for this function/g));
    });

    it("Creates a routine if function authority set routinesRequireAuthorization and signs the txn", async () => {
      // using payer3 to create a routine for a function that has routines disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const routineKeypair = Keypair.generate();

      const [escrowWallet, escrowTokenWallet] = getSwitchboardWalletPubkeys(
        switchboard.program3,
        switchboard.defaultQueue.publicKey,
        switchboard.payer3.publicKey,
        routineKeypair.publicKey
      );

      const txn = await switchboard.program3.methods
        .functionRoutineInit({
          // Metadata
          name: Buffer.from(""),
          metadata: Buffer.from(""),
          // Fees
          bounty: new BN(0),
          // Execution
          schedule: Buffer.from("* * * * * *"),
          maxContainerParamsLen: 256,
          containerParams: Buffer.from(""),
        })
        .accounts({
          routine: routineKeypair.publicKey,
          authority: switchboard.payer3.publicKey,
          function: permissionedFunctionPubkey,
          functionAuthority: switchboard.payer2.publicKey,
          escrowWallet: escrowWallet,
          escrowTokenWallet: escrowTokenWallet,
          escrowWalletAuthority: null,
          mint: nativeMint,
          attestationQueue: switchboard.defaultQueue.publicKey,
          payer: switchboard.payer3.publicKey,
        })
        .signers([routineKeypair, switchboard.payer2])
        .rpc();
    });
  });

  /**
   * Test the function routine init functionality
   * - creates a routine from a keypair
   */
  describe("FunctionRoutine Init", () => {
    let functionPubkey: PublicKey;

    before(async () => {
      let functionInit: string;
      [functionPubkey, functionInit] = await createFunction(
        switchboard.program1,
        switchboard.defaultQueue.publicKey,
        "Function_RoutineInitTests",
        { authority: switchboard.payer1 }
      );
    });

    it("Creates a routine from a keypair", async () => {
      // using payer3 to create a routine for a function that has routines disabled
      const program = switchboard.program3;
      const payer = switchboard.payer3;

      const routineKeypair = Keypair.generate();

      const [escrowWallet, escrowTokenWallet] = getSwitchboardWalletPubkeys(
        program,
        switchboard.defaultQueue.publicKey,
        payer.publicKey,
        routineKeypair.publicKey
      );

      const txn = await program.methods
        .functionRoutineInit({
          // Metadata
          name: null,
          metadata: null,
          // Fees
          bounty: null,
          // Execution
          schedule: Buffer.from("* * * * * *"),
          containerParams: Buffer.from(""),
          maxContainerParamsLen: null,
        })
        .accounts({
          routine: routineKeypair.publicKey,
          authority: payer.publicKey,
          function: functionPubkey,
          functionAuthority: null,
          escrowWallet: escrowWallet,
          escrowTokenWallet: escrowTokenWallet,
          escrowWalletAuthority: null,
          mint: nativeMint,
          attestationQueue: switchboard.defaultQueue.publicKey,
          payer: payer.publicKey,
        })
        .signers([routineKeypair])
        .rpc();
    });
  });

  /**
   * Tests
   * 1. The unassigned oracle fails to verify the routine and throws IllegalVerifier (fail)
   * 2. The assigned oracle verifies the routine (success)
   *    - The queue_idx rotates
   *    - The timestamp is updated
   * 3. Fails to verify the routine if the routine is disabled (throws RoutineDisabled)
   * 4. Fails to verify if the mr_enclave is all 0s (throws InvalidMrEnclave)
   * 5. Fails to verify if the function has 0 mr_enclaves defined (throws MrEnclavesEmpty)
   * 6. Fails to verify the routine if the mr_enclave mismatches (throws IncorrectMrEnclave)
   * 7. Fails to verify the routine if the container params hash mismatches (throws InvalidParamsHash)
   * 8. Fails to verify if the function has a routine_fee > 0 and the function escrow was not provided (throws MissingFunctionEscrow)
   * 9. Fails to verify if the function has a routine_fee > 0 and the function escrow is not correct (throws InvalidEscrow)
   * 10. Fails to verify if the observed timestamp is more than 20 seconds off (throws IncorrectObservedTime)
   */
  describe("FunctionRoutine Verification", () => {
    let functionPubkey: PublicKey;

    before(async () => {
      let functionInit: string;
      [functionPubkey, functionInit] = await createFunction(
        _program,
        switchboard.defaultQueue.publicKey,
        "FunctionRoutineVerificationTests"
      );
    });

    it("Fails to verify a routine if an unassigned oracle responds", async () => {
      const functionState = await _program.account.functionAccountData.fetch(
        functionPubkey
      );
      const functionRoutineKeypair = Keypair.generate();
      const [escrowWallet, escrowTokenWallet] = getSwitchboardWalletPubkeys(
        _program,
        switchboard.defaultQueue.publicKey,
        authority.publicKey,
        functionRoutineKeypair.publicKey
      );
      await switchboard.program.methods
        .functionRoutineInit({
          // Metadata
          name: null,
          metadata: null,
          // Fees
          bounty: null,
          // Execution
          schedule: Buffer.from("* * * * * *"),
          containerParams: Buffer.from(""),
          maxContainerParamsLen: null,
        })
        .accounts({
          routine: functionRoutineKeypair.publicKey,
          authority: authority.publicKey,
          function: functionPubkey,
          functionAuthority: payer.publicKey,
          escrowWallet: escrowWallet,
          escrowTokenWallet: escrowTokenWallet,
          escrowWalletAuthority: authority.publicKey,
          mint: nativeMint,
          attestationQueue: switchboard.defaultQueue.publicKey,
          payer: payer.publicKey,
        })
        .signers([functionRoutineKeypair])
        .rpc();

      const routineState =
        await _program.account.functionRoutineAccountData.fetch(
          functionRoutineKeypair.publicKey
        );

      const queueIdx = routineState.queueIdx + 1;
      const verifier = switchboard.defaultQueue.getVerifier(queueIdx);

      const unixTimestamp = Math.floor(Date.now() / 1000);
      const enclaveSigner = Keypair.generate();

      await assert.rejects(async () => {
        const tx = await switchboard.program.methods
          .functionRoutineVerify({
            observedTime: new BN(unixTimestamp),
            nextAllowedTimestamp: new BN(unixTimestamp + 60),
            errorCode: 0,
            mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
            containerParamsHash: routineState.containerParamsHash,
          })
          .accounts({
            ...verifier.getAccounts(),
            routine: functionRoutineKeypair.publicKey,
            functionEnclaveSigner: enclaveSigner.publicKey,
            escrowWallet: routineState.escrowWallet,
            escrowTokenWallet: routineState.escrowTokenWallet,
            function: functionPubkey,
            functionEscrowTokenWallet: functionState.escrowTokenWallet,
            attestationQueue: switchboard.defaultQueue.publicKey,
            receiver: payerTokenWallet,
          })
          .signers([verifier.signer, enclaveSigner])
          .rpc();
      }, new RegExp("IllegalVerifier"));
    });

    it("Verifies a function routine", async () => {
      const functionState = await _program.account.functionAccountData.fetch(
        functionPubkey
      );

      const functionRoutineKeypair = Keypair.generate();
      const [escrowWallet, escrowTokenWallet] = getSwitchboardWalletPubkeys(
        _program,
        switchboard.defaultQueue.publicKey,
        authority.publicKey,
        functionRoutineKeypair.publicKey
      );
      const txn = await _program.methods
        .functionRoutineInit({
          // Metadata
          name: null,
          metadata: null,
          // Fees
          bounty: null,
          // Execution
          schedule: Buffer.from("* * * * * *"),
          containerParams: Buffer.from(""),
          maxContainerParamsLen: null,
        })
        .accounts({
          routine: functionRoutineKeypair.publicKey,
          authority: authority.publicKey,
          function: functionPubkey,
          functionAuthority: payer.publicKey,
          escrowWallet: escrowWallet,
          escrowTokenWallet: escrowTokenWallet,
          escrowWalletAuthority: authority.publicKey,
          mint: nativeMint,
          attestationQueue: switchboard.defaultQueue.publicKey,
          payer: payer.publicKey,
        })
        .signers([functionRoutineKeypair])
        .rpc();

      const unixTimestamp = Math.floor(Date.now() / 1000);
      const enclaveSigner = Keypair.generate();

      const routineState =
        await _program.account.functionRoutineAccountData.fetch(
          functionRoutineKeypair.publicKey
        );

      const verifier = switchboard.defaultQueue.getVerifier(
        routineState.queueIdx
      );

      await _program.methods
        .functionRoutineVerify({
          observedTime: new BN(unixTimestamp),
          nextAllowedTimestamp: new BN(unixTimestamp + 60),
          errorCode: 0,
          mrEnclave: Array.from(functionMrEnclave).slice(0, 32),
          containerParamsHash: routineState.containerParamsHash,
        })
        .accounts({
          ...verifier.getAccounts(),
          routine: functionRoutineKeypair.publicKey,
          functionEnclaveSigner: enclaveSigner.publicKey,
          escrowWallet: routineState.escrowWallet,
          escrowTokenWallet: routineState.escrowTokenWallet,
          function: functionPubkey,
          functionEscrowTokenWallet: functionState.escrowTokenWallet,
          attestationQueue: switchboard.defaultQueue.publicKey,
          receiver: payerTokenWallet,
        })
        .signers([verifier.signer, enclaveSigner])
        .rpc();
    });
  });

  /**
   * Token transfer tests
   *
   * Tests
   *
   * 1. Correct amounts are sent when all token fees are set
   * 2. Request should fail open when not enough fees are provided but enough to set error_code
   */
  describe("FunctionRoutine Rewards", () => {});

  /**
   * Error code status reporting
   *
   * 1. Error code less than 200 still pays out
   */
  describe("FunctionRoutine ErrorCodes", () => {});
});
