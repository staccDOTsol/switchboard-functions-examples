import "mocha";

import type { SwitchboardAttestationProgram } from "../target/types/switchboard_attestation_program";
import type { SwitchboardV2 } from "../target/types/switchboard_v2";

import {
  createAttestationQueue,
  createFunction,
  DEFAULT_CREATOR_SEED,
  printLogs,
  SwitchboardWallet,
} from "./v3-utils";

import * as anchor from "@coral-xyz/anchor";
import {
  AttestationProgramStateAccount,
  type BootstrappedAttestationQueue,
  NativeMint,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import assert from "assert";

const defaulWalletSeed = "DefaultSeed";

describe("Function Tests", () => {
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

  let myDefaultWallet: SwitchboardWallet;

  before(async () => {
    switchboardProgram = new SwitchboardProgram(
      sbv2 as any,
      attestationProgram as any,
      "localnet",
      await NativeMint.load(provider as any)
    );

    switchboard = await createAttestationQueue(switchboardProgram);

    await AttestationProgramStateAccount.getOrCreate(switchboardProgram);

    let walletInitTxnSignature: string;
    [myDefaultWallet, walletInitTxnSignature] = await SwitchboardWallet.create(
      switchboardProgram,
      switchboard.attestationQueueAccount.publicKey,
      payer,
      defaulWalletSeed,
      8
    );
    await printLogs(switchboardProgram.connection, walletInitTxnSignature);

    console.log(`myDefaultWallet: ${myDefaultWallet.publicKey}`);
    console.log(`myDefaultTokenWallet: ${myDefaultWallet.tokenWallet}`);
  });

  it("Creates a function account and initializes a fresh wallet", async () => {
    const authorityKeypair = anchor.web3.Keypair.generate();
    const [myFunctionAccount, functionInit] = await createFunction(
      switchboard,
      undefined,
      undefined,
      authorityKeypair.publicKey
    );
    await printLogs(switchboardProgram.connection, functionInit);

    const funcState =
      await attestationProgram.account.functionAccountData.fetch(
        myFunctionAccount.publicKey
      );

    const wallet = new SwitchboardWallet(switchboardProgram, funcState.escrow);

    // const walletState = await wallet.loadData();
    // console.log(walletState);
  });

  it("Creates a function account with an existing wallet", async () => {
    const [myFunctionAccount, functionInit] = await createFunction(
      switchboard,
      undefined,
      myDefaultWallet
    );
    await printLogs(switchboardProgram.connection, functionInit);

    const [myFunctionAccount2, functionInit2] = await createFunction(
      switchboard,
      undefined,
      myDefaultWallet
    );
    await printLogs(switchboardProgram.connection, functionInit2);

    const [myFunctionAccount3, functionInit3] = await createFunction(
      switchboard,
      undefined,
      myDefaultWallet
    );
    await printLogs(switchboardProgram.connection, functionInit3);

    const walletState = await myDefaultWallet.loadData();

    assert(walletState.resourceCount === 3, "ResourceCountMismatch");

    console.log(`Attempting to reset the functionAccount #3 escrow`);

    const functionState = await myFunctionAccount3.loadData();

    const defaultWallet = SwitchboardWallet.fromSeed(
      switchboardProgram,
      functionState.attestationQueue,
      functionState.authority,
      myFunctionAccount3.publicKey
    );

    const txn = await attestationProgram.methods
      .functionResetEscrow({})
      .accounts({
        function: myFunctionAccount3.publicKey,
        authority: functionState.authority,
        attestationQueue: functionState.attestationQueue,
        mint: switchboardProgram.mint.address,
        escrowWallet: functionState.escrowWallet,
        defaultWallet: defaultWallet.publicKey,
        tokenWallet: defaultWallet.tokenWallet,
        payer,
        state: switchboardProgram.attestationProgramState.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await printLogs(switchboardProgram.connection, txn);

    const updatedWalletState = await myDefaultWallet.loadData();

    assert(updatedWalletState.resourceCount === 2, "ResourceCountMismatch");
  });

  it("Creates then closes a function account", async () => {
    const [escrowDest] = await switchboardProgram.mint.getOrCreateWrappedUser(
      payer,
      { fundUpTo: 0.1 }
    );
    const [myFunctionAccount, functionInit] = await createFunction(switchboard);
    await printLogs(switchboardProgram.connection, functionInit);

    const funcState =
      await attestationProgram.account.functionAccountData.fetch(
        myFunctionAccount.publicKey
      );

    const wallet = new SwitchboardWallet(switchboardProgram, funcState.escrow);

    console.log(`created function: ${myFunctionAccount.publicKey}`);

    const txn = await attestationProgram.methods
      .functionOverrideClose()
      .accounts({
        function: myFunctionAccount.publicKey,
        // addressLookupTable: funcState.addressLookupTable,
        // escrowWallet: funcState.escrowWallet,
        solDest: payer,
        // escrowDest,
        // state: switchboardProgram.attestationProgramState.publicKey,
        // addressLookupProgram: new anchor.web3.PublicKey(
        //   "AddressLookupTab1e1111111111111111111111111"
        // ),
      })
      .rpc({ skipPreflight: true });

    console.log(`functionOverrideClose: ${txn}`);
    await printLogs(switchboardProgram.connection, txn);

    const funcAccountInfo = await switchboardProgram.connection.getAccountInfo(
      myFunctionAccount.publicKey
    );

    assert(!funcAccountInfo, "Function should be closed");

    // const walletState = await wallet.loadData();
    // console.log(walletState);
  });
});
