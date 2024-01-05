import "mocha";

import type { SwitchboardAttestationProgram } from "../target/types/switchboard_attestation_program";
import type { SwitchboardV2 } from "../target/types/switchboard_v2";

import {
  containerMrEnclave,
  createAttestationQueue,
  createFunction,
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

describe("Attestation Requests Tests", () => {
  const provider = anchor.AnchorProvider.env();
  const payer = provider.publicKey;

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const sbv2 = anchor.workspace.SwitchboardV2 as anchor.Program<SwitchboardV2>;
  const attestationProgram = anchor.workspace
    .SwitchboardAttestationProgram as anchor.Program<SwitchboardAttestationProgram>;

  let switchboardProgram: SwitchboardProgram;
  let switchboard: BootstrappedAttestationQueue;
  let functionAccount: FunctionAccount;

  const requestKeypair = anchor.web3.Keypair.generate();

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

  it("Creates a function account", async () => {
    let functionInit: string;
    [functionAccount, functionInit] = await createFunction(switchboard, {
      seed: "MyNewSeed",
    });
    await printLogs(switchboardProgram.connection, functionInit);
  });

  // TODO: Add tests which fails before the enclave is added

  it("Creates a request", async () => {
    const functionState = await functionAccount.loadData();
    const escrow = functionState.escrow;

    const initialEscrowBalance = await switchboardProgram.mint.fetchBalance(
      escrow
    )!;
    console.log(`initialEscrowBalance: ${initialEscrowBalance}`);

    const initialPayerBalance = await switchboardProgram.connection.getBalance(
      payer
    );
    console.log(`initialBalance: ${initialPayerBalance}`);

    const rentExemption =
      await switchboardProgram.connection.getMinimumBalanceForRentExemption(
        attestationProgram.account.functionRequestAccountData.size
      );
    console.log(`rentExemption: ${rentExemption}`);

    // TODO: Add a bounty to this space and validate on-chain that its correct
    const params = Buffer.from("CUSTOM_PARAM=devnet,CUSTOM_PARAM_2=value");
    // const params = Buffer.from("");

    try {
      const txn = await attestationProgram.methods
        .functionRequestInit({
          maxContainerParamsLen: null,
          containerParams: params,
          garbageCollectionSlot: null,
        })
        .accounts({
          request: requestKeypair.publicKey,
          function: functionAccount.publicKey,
          functionAuthority: payer,
          attestationQueue: switchboard.attestationQueueAccount.publicKey,
          escrow: switchboardProgram.mint.getAssociatedAddress(
            requestKeypair.publicKey
          ),
          mint: switchboardProgram.mint.address,
          state: switchboardProgram.attestationProgramState.publicKey,
          payer: switchboardProgram.provider.publicKey,
          authority: switchboardProgram.provider.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        })
        .signers([requestKeypair])
        .rpc();
      console.log(`Txn Signature: ${txn}`);
      await printLogs(switchboardProgram.connection, txn);
    } catch (error) {
      console.error(error);
      throw error;
    }

    // const requestState =
    //   await attestationProgram.account.functionRequestAccountData.fetch(
    //     requestKeypair.publicKey
    //   );

    const finalEscrowBalance = await switchboardProgram.mint.fetchBalance(
      escrow
    )!;
    console.log(`finalEscrowBalance: ${finalEscrowBalance}`);

    const finalPayerBalance = await switchboardProgram.connection.getBalance(
      payer
    );
    console.log(`finalPayerBalance: ${finalPayerBalance}`);

    const diff = initialPayerBalance - finalPayerBalance;
    console.log(`diff: ${diff}`);

    const diffWithoutRentExemption = diff - rentExemption;
    console.log(`diffWithoutRentExemption: ${diffWithoutRentExemption}`);

    const acctInfo = await provider.connection.getAccountInfo(
      requestKeypair.publicKey
    );
    console.log(`Request Lamports: ${acctInfo?.lamports.toString(10)}`);
    console.log(
      `Request Rent: ${
        (acctInfo?.lamports ?? 0) / anchor.web3.LAMPORTS_PER_SOL
      }`
    );
    // console.log(JSON.stringify(requestState, jsonReplacers, 2));
  });

  it("Triggers a function request", async () => {
    const receiver = await switchboardProgram.mint.getOrCreateAssociatedUser(
      payer
    );

    console.log(
      `escrowBalance: ${await switchboardProgram.mint.getAssociatedBalance(
        requestKeypair.publicKey
      )!}`
    );

    try {
      const txn = await attestationProgram.methods
        .functionRequestTrigger({
          bounty: new anchor.BN(8000),
          slotsUntilExpiration: new anchor.BN(100),
        })
        .accounts({
          request: requestKeypair.publicKey,
          function: functionAccount.publicKey,
          escrow: switchboardProgram.mint.getAssociatedAddress(
            requestKeypair.publicKey
          ),
          payer: payer,
          authority: payer,
          state: switchboardProgram.attestationProgramState.publicKey,
          attestationQueue: switchboard.attestationQueueAccount.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`requestRequest: ${txn}`);
      await printLogs(switchboardProgram.connection, txn);
    } catch (error) {
      console.error(error);
      throw error;
    }

    const requestState =
      await attestationProgram.account.functionRequestAccountData.fetch(
        requestKeypair.publicKey
      );

    console.log(
      `escrowBalance: ${await switchboardProgram.mint.getAssociatedBalance(
        requestKeypair.publicKey
      )!}`
    );

    // console.log(JSON.stringify(requestState, jsonReplacers, 2));
  });

  it("Fulfills a function request", async () => {
    const functionState = await functionAccount.loadData();
    const functionEscrow = functionState.escrow;

    const enclaveSigner = anchor.web3.Keypair.generate();
    // const [receiver] = await switchboardProgram.mint.getOrCreateWrappedRequest(
    //   payer,
    //   { fundUpTo: 0 }
    // );
    const receiver = await switchboardProgram.mint.getOrCreateAssociatedUser(
      payer
    );

    console.log(
      `escrowBalance: ${await switchboardProgram.mint.getAssociatedBalance(
        requestKeypair.publicKey
      )!}`
    );

    const requestState =
      await attestationProgram.account.functionRequestAccountData.fetch(
        requestKeypair.publicKey
      );

    try {
      const txn = await attestationProgram.methods
        .functionRequestVerify({
          observedTime: new anchor.BN(Math.floor(Date.now() / 1000)),
          mrEnclave: Array.from(containerMrEnclave),
          isFailure: false,
          requestSlot: requestState.activeRequest.requestSlot,
          containerParamsHash: requestState.containerParamsHash,
        })
        .accounts({
          request: requestKeypair.publicKey,
          function: functionAccount.publicKey,
          functionEnclaveSigner: enclaveSigner.publicKey,
          verifierQuote: switchboard.verifier.quoteAccount.publicKey,
          verifierEnclaveSigner: switchboard.verifier.signer.publicKey,
          attestationQueue: switchboard.attestationQueueAccount.publicKey,
          verifierPermission: switchboard.verifier.permissionAccount.publicKey,
          state: switchboardProgram.attestationProgramState.publicKey,
          escrow: switchboardProgram.mint.getAssociatedAddress(
            requestKeypair.publicKey
          ),
          functionEscrow: functionEscrow,
          receiver,
        })
        .signers([switchboard.verifier.signer, enclaveSigner])
        .rpc();
      console.log(`requestVerify: ${txn}`);
      await printLogs(switchboardProgram.connection, txn);
    } catch (error) {
      console.error(error);
      throw error;
    }

    // const requestState =
    //   await attestationProgram.account.functionRequestAccountData.fetch(
    //     requestKeypair.publicKey
    //   );

    console.log(
      `escrowBalance: ${await switchboardProgram.mint.getAssociatedBalance(
        requestKeypair.publicKey
      )!}`
    );

    // console.log(JSON.stringify(requestState, jsonReplacers, 2));
  });
});
