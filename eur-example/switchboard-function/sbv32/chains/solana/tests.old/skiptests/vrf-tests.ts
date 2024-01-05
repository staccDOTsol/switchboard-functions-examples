import "mocha";
import * as spl from "@solana/spl-token";
import * as assert from "assert";
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import { OracleJob } from "@switchboard-xyz/switchboard-api";
const bs58 = require("bs58");
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  Signer,
  sendAndConfirmRawTransaction,
  TransactionSignature,
} from "@solana/web3.js";

describe("Job tests", async () => {
  // Program for the tests.
  const program = anchor.workspace.SwitchboardV2;
  try {
    await sbv2.ProgramStateAccount.create(program, {});
  } catch (e) {}

  const [programStateAccount, sbump] = await sbv2.ProgramStateAccount.fromSeed(
    program
  );
  let MINT = (await programStateAccount.getTokenMint()).publicKey;
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  it("vrf proof check", async () => {
    // await sbv2.ProgramStateAccount.create(program, {});
    const alpha = Buffer.from("hello");
    const pubkey = new PublicKey([
      147, 28, 155, 178, 248, 91, 32, 19, 134, 45, 2, 113, 234, 117, 131, 217,
      108, 12, 3, 79, 59, 105, 196, 223, 32, 161, 186, 35, 188, 140, 89, 2,
    ]).toBytes();
    const proof = Buffer.from([
      194, 249, 245, 41, 248, 139, 79, 149, 4, 68, 155, 218, 72, 121, 40, 217,
      14, 118, 98, 254, 154, 92, 104, 249, 135, 80, 220, 66, 201, 23, 110, 125,
      227, 68, 234, 105, 57, 58, 54, 113, 207, 109, 169, 161, 229, 171, 29, 49,
      230, 100, 51, 190, 199, 237, 101, 123, 210, 101, 58, 249, 176, 42, 60, 87,
      196, 155, 36, 6, 37, 173, 10, 168, 241, 193, 206, 65, 24, 249, 224, 13,
    ]);
    const payerKeypair = Keypair.fromSecretKey(
      (program.provider.wallet as any).payer.secretKey
    );
    const vrf = anchor.web3.Keypair.fromSeed(new Uint8Array(32));
    const [programStateAccount, stateBump] =
      sbv2.ProgramStateAccount.fromSeed(program);
    const switchTokenMint = await programStateAccount.getTokenMint();
    const escrow = await spl.Token.getAssociatedTokenAddress(
      switchTokenMint.associatedProgramId,
      switchTokenMint.programId,
      switchTokenMint.publicKey,
      vrf.publicKey,
      true
    );

    try {
      await (switchTokenMint as any).createAssociatedTokenAccountInternal(
        vrf.publicKey,
        escrow
      );
    } catch (e) {
      console.log(e);
    }
    const size = program.account.vrfAccountData.size;
    console.log("!!!");
    console.log(size);
    console.log(program.programId.toBase58());
    // console.log(
    // await program.provider.connection.getAccountInfo(
    // program.provider.wallet.publicKey
    // )
    // );
    const oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
      name: Buffer.from("q1"),
      metadata: Buffer.from(""),
      slashingEnabled: false,
      reward: new anchor.BN(0),
      minStake: new anchor.BN(0),
      authority: payerKeypair.publicKey,
      oracleTimeout: new anchor.BN(3, 10),
      mint: MINT,
    });

    let oracleAccount = await sbv2.OracleAccount.create(program, {
      queueAccount: oracleQueueAccount,
    });

    let permissionAccount = await sbv2.PermissionAccount.create(program, {
      authority: payerKeypair.publicKey,
      granter: oracleQueueAccount.publicKey,
      grantee: oracleAccount.publicKey,
    });

    await permissionAccount.set({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
      authority: payerKeypair,
      enable: true,
    });
    await oracleAccount.heartbeat(payerKeypair);
    await switchTokenMint.setAuthority(
      escrow,
      programStateAccount.publicKey,
      "AccountOwner",
      vrf,
      []
    );

    await program.rpc.vrfInit(
      {
        callback: {
          program_id: PublicKey.default, // should check its executable
          accounts: [],
          accounts_len: 0,
          ix_data: [],
          ix_data_len: 0,
        },
        stateBump,
      },
      {
        accounts: {
          vrf: vrf.publicKey,
          authority: program.provider.wallet.publicKey,
          oracleQueue: oracleQueueAccount.publicKey,
          systemProgram: SystemProgram.programId,
          escrow,
          programState: programStateAccount.publicKey,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        },
        instructions: [
          anchor.web3.SystemProgram.createAccount({
            fromPubkey: program.provider.wallet.publicKey,
            newAccountPubkey: vrf.publicKey,
            space: size,
            lamports:
              await program.provider.connection.getMinimumBalanceForRentExemption(
                size
              ),
            programId: program.programId,
          }),
        ],
        signers: [vrf],
      }
    );

    let state: any = await program.account.vrfAccountData.fetch(vrf.publicKey);
    console.log(state);
    const txs: Array<any> = [];
    const signers: Array<Signer> = [];
    for (let i = 0; i < 276; ++i) {
      txs.push({
        tx: program.transaction.vrfVerify(
          {
            alpha,
            proof,
            pubkey: new PublicKey(pubkey),
            nonce: i,
          },
          {
            accounts: {
              vrf: vrf.publicKey,
            },
          }
        ),
        signers,
      });
    }
    await sendAll(program.provider, txs);
    state = await program.account.vrfAccountData.fetch(vrf.publicKey);
    console.log(state);
    if (state.builders[0].verified === true) {
      console.log("VRF ON CHAIN VERIFICATION SUCCESS");
    } else {
      console.log("VRF ON CHAIN VERIFICATION FAILURE");
    }
  });
});

async function sendAll(provider: anchor.AnchorProvider, reqs: Array<any>) {
  const opts = provider.opts;
  const blockhash = await provider.connection.getRecentBlockhash(
    opts.preflightCommitment
  );

  let txs = reqs.map((r) => {
    let tx = r.tx;
    let signers = r.signers;

    if (signers === undefined) {
      signers = [];
    }

    tx.feePayer = provider.wallet.publicKey;
    tx.recentBlockhash = blockhash.blockhash;

    signers
      .filter((s: any): s is Signer => s !== undefined)
      .forEach((kp: any) => {
        tx.partialSign(kp);
      });

    return tx;
  });

  const signedTxs = await provider.wallet.signAllTransactions(txs);
  const promises = [];
  for (let k = 0; k < txs.length; k += 1) {
    const tx = signedTxs[k];
    const rawTx = tx.serialize();
    promises.push(
      sendAndConfirmRawTransaction(provider.connection, rawTx, opts)
    );
  }
  const sigs = await Promise.all(promises);
  console.log(sigs);
}
