import "mocha";
var assert = require("assert");
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import { OracleJob } from "@switchboard-xyz/switchboard-api";
import { Keypair, PublicKey } from "@solana/web3.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Queue Tests", async () => {
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const program = anchor.workspace.SwitchboardV2;

  let account: sbv2.CrankAccount;
  let oracleQueueAccount: sbv2.OracleQueueAccount;
  let publisher: PublicKey;
  const payerKeypair = Keypair.fromSecretKey(
    (program.provider.wallet as any).payer.secretKey
  );
  try {
    await sbv2.ProgramStateAccount.create(program, {});
  } catch (e) {}
  const [programStateAccount, _bump] = await sbv2.ProgramStateAccount.fromSeed(
    program
  );
  let MINT = (await programStateAccount.getTokenMint()).publicKey;

  it("Creates a Queue", async () => {
    oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
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

    const switchTokenMint = await programStateAccount.getTokenMint();

    publisher = await switchTokenMint.createAccount(
      program.provider.wallet.publicKey
    );

    await programStateAccount.vaultTransfer(publisher, payerKeypair, {
      amount: new anchor.BN(1000),
    });
  });

  let oracles: Array<sbv2.OracleAccount>;
  it("Pushes a Oracle onto the Queue", async () => {
    // Create five oracle accounts for testing.
    oracles = await Promise.all(
      [...Array(5).keys()].map(
        async (i) =>
          await sbv2.OracleAccount.create(program, {
            queueAccount: oracleQueueAccount,
          })
      )
    );

    // Load the oracle accounts' data
    let oraclesDataDict: { [key: string]: any } = {};
    let oraclesDict: { [key: string]: sbv2.OracleAccount } = {};
    await Promise.all(
      oracles.map(async (o) => {
        let k = o.publicKey;
        oraclesDataDict[k.toString()] = await o.loadData();
        oraclesDict[k.toString()] = o;
      })
    );

    Object.values(oraclesDataDict).forEach((o) => {
      assert(o.numInUse === 0);
    });

    // Make sure the queue's size is correctly set to 0
    // and that it's empty
    let queueData = await oracleQueueAccount.loadData();
    assert(queueData.queue[0].equals(PublicKey.default));
    assert(queueData.size === 0);
    assert(queueData.oracleTimeout === 3);

    // Need a permission for oracles[0]
    let permissionAccount = await sbv2.PermissionAccount.create(program, {
      authority: payerKeypair.publicKey,
      granter: oracleQueueAccount.publicKey,
      grantee: oracles[0].publicKey,
    });

    await permissionAccount.set({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
      authority: payerKeypair,
      enable: true,
    });

    await oracles[0].heartbeat(payerKeypair);
    queueData = await oracleQueueAccount.loadData();
    assert(queueData.size === 1);

    // oracles[1] doesn't have a permission, so this should fail:
    await assert.rejects(async () => {
      return await oracles[1].heartbeat(payerKeypair);
    });

    // Create a perimission account for the rest of the oracles.
    await Promise.all(
      oracles.slice(1, 5).map(async (o) => {
        let permissionAccount = await sbv2.PermissionAccount.create(program, {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: o.publicKey,
        });

        await permissionAccount.set({
          permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
          authority: payerKeypair,
          enable: true,
        });
      })
    );

    // heartbeat all the oracles onto the queue
    await Promise.all(
      oracles.map(async (o) => await o.heartbeat(payerKeypair))
    );
    queueData = await oracleQueueAccount.loadData();
    assert(queueData.size === 5);
    assert(queueData.currIdx === 0);
    // this is broken...
    console.log(`gc_idx: ${queueData.gcIdx}`);
    queueData.queue.slice(0, 5).forEach((p: any, i: number) => {
      console.log(`#${i} in queue: ${p.toString()}`);
      console.log(oracles[i].publicKey.toBase58());
    });
    assert(queueData.gcIdx === 4);

    // here we reload the Dict of Oracle data
    // (so we can reference their data by public key)
    await Promise.all(
      oracles.map(async (o) => {
        let k = o.publicKey;
        return (oraclesDataDict[k.toString()] = await o.loadData());
      })
    );

    queueData.queue.slice(0, 5).forEach((p: any, i: number) => {
      console.log(
        `oracle #${i} num_in_use: ${oraclesDataDict[p.toString()].numInUse}`
      );
      assert(oraclesDataDict[p.toString()].numInUse === 1);
    });

    for (var i = 0; i < 5; i++) {
      console.log("Waiting 3.5 seconds");
      await sleep(3500);
      console.log("heartbeating oracle #2...");
      console.log(`gc_idx is ${queueData.gcIdx}`);
      console.log(`size is ${queueData.size}`);
      await oraclesDict[queueData.queue[2].toString()].heartbeat(payerKeypair);
      queueData = await oracleQueueAccount.loadData();
      await Promise.all(
        oracles.map(async (o) => {
          let k = o.publicKey;
          return (oraclesDataDict[k.toString()] = await o.loadData());
        })
      );
      for (var j = 0; j < oracles.length; j++) {
        console.log(
          `oracle #${j}: num_in_use: ${
            oraclesDataDict[queueData.queue[j].toString()].numInUse
          }`
        );
      }
    }
  });
});
