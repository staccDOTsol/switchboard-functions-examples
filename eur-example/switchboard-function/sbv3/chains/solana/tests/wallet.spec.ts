/* eslint-disable no-unused-vars */
import "mocha";

import type { SwitchboardAttestationProgram } from "../target/types/switchboard_attestation_program";

import { Switchboard } from "./utils/switchboard";
import {
  createFunction,
  getSwitchboardWalletPubkeys,
  nativeMint,
} from "./utils/utils";

import type { Program } from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@switchboard-xyz/common";
import { parseRawBuffer } from "@switchboard-xyz/solana.js";
import assert from "assert";

describe("Wallet Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const _program: Program<SwitchboardAttestationProgram> =
    anchor.workspace.SwitchboardAttestationProgram;

  let switchboard: Switchboard<SwitchboardAttestationProgram>;

  before(async () => {
    switchboard = await Switchboard.initialize(_program);
  });

  /**
   * Tests
   * 1. payer1 creates a wallet from a name string with payer1 as authority (success)
   * 2. payer2 creates a wallet from a name string with payer2 as authority (success)
   * 3. payer1 creates a wallet for payer2 with payer2 as authority (success)
   * 4. payer1 fails to create a wallet with the same name (fail)
   * 5. payer1 fails to create a wallet with a name greater than 32 characters (fail)
   */
  describe("SwitchboardWallet Create", () => {
    // const defaultNameSeed = parseRawBuffer("MyMadeUpNameString", 32);
    const walletNameSeed = "MyMadeUpNameString";

    it("Creates a wallet from a name string", async () => {
      const [walletPubkey, walletTokenAccount] = getSwitchboardWalletPubkeys(
        switchboard.program1,
        switchboard.defaultQueue.publicKey,
        switchboard.payer1.publicKey,
        walletNameSeed
      );

      const txn = await switchboard.program1.methods
        .walletInit({ name: Buffer.from(walletNameSeed) })
        .accounts({
          wallet: walletPubkey,
          mint: nativeMint,
          authority: switchboard.payer1.publicKey,
          attestationQueue: switchboard.defaultQueue.publicKey,
          tokenWallet: walletTokenAccount,
          payer: switchboard.payer1.publicKey,
        })
        .rpc();
    });

    it("A different authority creates a wallet with the same name string", async () => {
      const [walletPubkey, walletTokenAccount] = getSwitchboardWalletPubkeys(
        switchboard.program2,
        switchboard.defaultQueue.publicKey,
        switchboard.payer2.publicKey,
        walletNameSeed
      );

      const txn = await switchboard.program2.methods
        .walletInit({ name: Buffer.from(walletNameSeed) })
        .accounts({
          wallet: walletPubkey,
          mint: nativeMint,
          authority: switchboard.payer2.publicKey,
          attestationQueue: switchboard.defaultQueue.publicKey,
          tokenWallet: walletTokenAccount,
          payer: switchboard.payer2.publicKey,
        })
        .rpc();
    });

    it("User creates a wallet for a different authority", async () => {
      // payer1 creates a wallet for payer2 with payer2 as the authority

      const newNameSeed = parseRawBuffer("NewNameSeed", 32);

      const walletPubkey = PublicKey.findProgramAddressSync(
        [
          nativeMint.toBytes(),
          switchboard.defaultQueue.publicKey.toBytes(),
          switchboard.payer2.publicKey.toBytes(), // use payer2 as authority
          Buffer.from(newNameSeed).slice(0, 32),
        ],
        switchboard.programId
      )[0];

      const walletTokenAccount = anchor.utils.token.associatedAddress({
        mint: nativeMint,
        owner: walletPubkey,
      });

      const txn = await switchboard.program1.methods
        .walletInit({ name: Buffer.from(newNameSeed) })
        .accounts({
          wallet: walletPubkey,
          mint: nativeMint,
          authority: switchboard.payer2.publicKey,
          attestationQueue: switchboard.defaultQueue.publicKey,
          tokenWallet: walletTokenAccount,
          payer: switchboard.payer1.publicKey,
        })
        .rpc();

      const walletState =
        await switchboard.program.account.switchboardWallet.fetch(walletPubkey);

      assert(walletState.authority.equals(switchboard.payer2.publicKey));
    });

    it("Fails to create a wallet with the same name", async () => {
      await assert.rejects(async () => {
        const [walletPubkey, walletTokenAccount] = getSwitchboardWalletPubkeys(
          switchboard.program1,
          switchboard.defaultQueue.publicKey,
          switchboard.payer1.publicKey,
          walletNameSeed
        );

        await switchboard.program1.methods
          .walletInit({ name: Buffer.from(walletNameSeed) })
          .accounts({
            wallet: walletPubkey,
            mint: nativeMint,
            authority: switchboard.payer1.publicKey,
            attestationQueue: switchboard.defaultQueue.publicKey,
            tokenWallet: walletTokenAccount,
            payer: switchboard.payer1.publicKey,
          })
          .rpc();
      }, new RegExp("custom program error: 0x0")); // 0x0 = account already exists
    });

    it("Fails to create a wallet with a name longer than 32 bytes", async () => {
      const rawWalletNameSeed = parseRawBuffer(
        "JustNeedToMakeUpAReallyLongName",
        32
      );
      const longWalletNameSeed = [...rawWalletNameSeed, 1, 2, 3, 4, 5, 6, 7, 8]; // len = 40

      assert.throws(() => {
        const walletPubkey = PublicKey.findProgramAddressSync(
          [
            nativeMint.toBytes(),
            switchboard.defaultQueue.publicKey.toBytes(),
            switchboard.payer1.publicKey.toBytes(),
            Buffer.from(longWalletNameSeed),
          ],
          switchboard.programId
        )[0];
      }, new RegExp("TypeError: Max seed length exceeded"));
    });
  });

  /**
   * Create a function1 with payer1 using sbWallet1
   * Create a function2 with payer2 using sbWallet2
   *
   * Tests
   * 1. Create a routine for function1 with payer1 using sbWallet1 (success)
   *    - Resource count should increment
   * 2. Create a routine for function1 with payer1 using sbWallet2, no payer2 signature (fail)
   *  - Verify the error MissingSbWalletAuthoritySigner is thrown
   * 3. Create a routine for function1 with payer1 using sbWallet2, with payer2 signature (success)
   *    - Resource count should increment
   */
  describe("SwitchboardWallet AccessControl", () => {
    const walletNameSeed = parseRawBuffer("SbWalletTesting", 32);

    // payer1
    let sbWallet1: PublicKey;
    let sbWalletTokenAccount1: PublicKey;
    let function1: PublicKey;

    // payer2
    let sbWallet2: PublicKey;
    let sbWalletTokenAccount2: PublicKey;

    before(async () => {
      sbWallet1 = PublicKey.findProgramAddressSync(
        [
          nativeMint.toBytes(),
          switchboard.defaultQueue.publicKey.toBytes(),
          switchboard.payer1.publicKey.toBytes(),
          Buffer.from(walletNameSeed).slice(0, 32),
        ],
        switchboard.programId
      )[0];
      sbWalletTokenAccount1 = anchor.utils.token.associatedAddress({
        mint: nativeMint,
        owner: sbWallet1,
      });
      await switchboard.program1.methods
        .walletInit({ name: Buffer.from(walletNameSeed) })
        .accounts({
          wallet: sbWallet1,
          mint: nativeMint,
          authority: switchboard.payer1.publicKey,
          attestationQueue: switchboard.defaultQueue.publicKey,
          tokenWallet: sbWalletTokenAccount1,
          payer: switchboard.payer1.publicKey,
        })
        .rpc();

      [function1] = await createFunction(
        switchboard.program1,
        switchboard.defaultQueue.publicKey,
        "FunctionConfigTests",
        undefined,
        sbWallet1
      );

      sbWallet2 = PublicKey.findProgramAddressSync(
        [
          nativeMint.toBytes(),
          switchboard.defaultQueue.publicKey.toBytes(),
          switchboard.payer2.publicKey.toBytes(),
          Buffer.from(walletNameSeed).slice(0, 32),
        ],
        switchboard.programId
      )[0];
      sbWalletTokenAccount2 = anchor.utils.token.associatedAddress({
        mint: nativeMint,
        owner: sbWallet2,
      });
      await switchboard.program2.methods
        .walletInit({ name: Buffer.from(walletNameSeed) })
        .accounts({
          wallet: sbWallet2,
          mint: nativeMint,
          authority: switchboard.payer2.publicKey,
          attestationQueue: switchboard.defaultQueue.publicKey,
          tokenWallet: sbWalletTokenAccount2,
          payer: switchboard.payer2.publicKey,
        })
        .rpc();
    });

    it("Wallet is shared with the same authority", async () => {
      const routineKeypair = Keypair.generate();

      const initialWalletState =
        await switchboard.program.account.switchboardWallet.fetch(sbWallet1);

      const txn = await switchboard.program1.methods
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
          authority: switchboard.payer1.publicKey,
          function: function1,
          functionAuthority: null,
          escrowWallet: sbWallet1,
          escrowTokenWallet: sbWalletTokenAccount1,
          escrowWalletAuthority: null,
          mint: nativeMint,
          attestationQueue: switchboard.defaultQueue.publicKey,
          payer: switchboard.payer1.publicKey,
        })
        .signers([routineKeypair])
        .rpc();

      const finalWalletState =
        await switchboard.program.account.switchboardWallet.fetch(sbWallet1);

      assert.equal(
        finalWalletState.resourceCount - initialWalletState.resourceCount,
        1
      );
    });

    it("Fail to share a wallet if the wallet authority did not sign", async () => {
      const routineKeypair = Keypair.generate();

      await assert.rejects(async () => {
        const txn = await switchboard.program1.methods
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
            authority: switchboard.payer1.publicKey,
            function: function1,
            functionAuthority: null,
            escrowWallet: sbWallet2, // using account #2
            escrowTokenWallet: sbWalletTokenAccount2, // using account #2
            escrowWalletAuthority: null,
            mint: nativeMint,
            attestationQueue: switchboard.defaultQueue.publicKey,
            payer: switchboard.payer1.publicKey,
          })
          .signers([routineKeypair])
          .rpc();
      }, new RegExp("MissingSbWalletAuthoritySigner"));
    });

    it("Wallet authority signs request and shares wallet with new authority", async () => {
      // payer1 creates a routine and uses sbWallet2 with payer2 as a signer
      const routineKeypair = Keypair.generate();

      const initialWalletState =
        await switchboard.program.account.switchboardWallet.fetch(sbWallet2);

      const txn = await switchboard.program1.methods
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
          authority: switchboard.payer1.publicKey,
          function: function1,
          functionAuthority: null,
          escrowWallet: sbWallet2, // using account #2
          escrowTokenWallet: sbWalletTokenAccount2, // using account #2
          escrowWalletAuthority: switchboard.payer2.publicKey, // using account #2
          mint: nativeMint,
          attestationQueue: switchboard.defaultQueue.publicKey,
          payer: switchboard.payer1.publicKey,
        })
        .signers([routineKeypair, switchboard.payer2]) // payer #2 must sign
        .rpc();

      const finalWalletState =
        await switchboard.program.account.switchboardWallet.fetch(sbWallet2);

      assert.equal(
        finalWalletState.resourceCount - initialWalletState.resourceCount,
        1
      );
    });
  });

  /**
   * Tests
   * 1. payer1 deposits into its escrow wallet (success)
   * 2. payer2 fails to deposit into payer1's escrow wallet (fail)
   * 3. payer1 fails to deposit into its escrow wallet if deposit_authority is None (fail)
   */
  describe("SwitchboardWallet Withdraw", () => {});

  // !! TODO: implement wallet_close ixn and check resource count before closing
  /**
   * Tests
   * 1. payer1 closes a wallet with payer1 as authority and receives escrow balance (success)
   * 2 fails to close a wallet if resource_count > 0 (fail)
   */
  describe("SwitchboardWallet Close", () => {});
});
