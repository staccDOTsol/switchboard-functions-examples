import "mocha";
const chai = require("chai");
const expect = chai.expect;
var assert = require("assert");
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/solana.js";
import { OracleJob } from "@switchboard-xyz/common";
import {
  Keypair,
  SystemProgram,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
import Big from "big.js";
import * as bs58 from "bs58";
import * as crypto from "crypto";
import * as spl from "@solana/spl-token";

async function setupPermissions(
  queueAccount: sbv2.OracleQueueAccount,
  aggregatorAccount: sbv2.AggregatorAccount,
  authority: Keypair
) {
  const permissionAccount = await sbv2.PermissionAccount.create(
    queueAccount.program,
    {
      authority: authority.publicKey,
      granter: queueAccount.publicKey,
      grantee: aggregatorAccount.publicKey,
    }
  );
  await permissionAccount.set({
    permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
    authority: authority,
    enable: true,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Max Batchsize", async () => {
  const numOracles = 10;
  const provider = anchor.AnchorProvider.local();
  const program = anchor.workspace.SwitchboardV2;
  let programStateAccount: sbv2.ProgramStateAccount;
  let sbump;

  anchor.setProvider(provider);

  let aggregatorAccount: sbv2.AggregatorAccount;
  let job1: sbv2.JobAccount;
  let tasks;

  let oracleQueueAccount: sbv2.OracleQueueAccount;

  let oracles: Array<sbv2.OracleAccount>;
  let payoutKeypair;
  let payoutWallet: PublicKey;

  const payerKeypair = Keypair.fromSecretKey(
    (program.provider.wallet as any).payer.secretKey
  );
  [programStateAccount, sbump] = await sbv2.ProgramStateAccount.getOrCreate(
    program,
    {}
  );
  let MINT = (await programStateAccount.getTokenMint()).publicKey;

  before(async () => {
    const switchTokenMint = await programStateAccount.getTokenMint();
    payoutKeypair = anchor.web3.Keypair.generate();
    payoutWallet = await switchTokenMint.createAccount(payoutKeypair.publicKey);

    tasks = [
      OracleJob.Task.create({
        httpTask: OracleJob.HttpTask.create({
          url: `https://www.binance.us/api/v3/ticker/price?symbol=BTCUSD`,
        }),
      }),
      OracleJob.Task.create({
        jsonParseTask: OracleJob.JsonParseTask.create({ path: "$.price" }),
      }),
    ];

    let buffer = Buffer.from(
      OracleJob.encodeDelimited(OracleJob.create({ tasks })).finish()
    );

    job1 = await sbv2.JobAccount.create(program, {
      name: Buffer.from("switch"),
      expiration: new anchor.BN(0),
      data: buffer,
      authority: sbv2.programWallet(program).publicKey,
    });

    oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
      name: Buffer.from("q1"),
      metadata: Buffer.from(""),
      reward: new anchor.BN(1),
      slashingEnabled: false,
      minStake: new anchor.BN(0),
      authority: payerKeypair.publicKey,
      mint: MINT,
    });
  });

  beforeEach(async () => {
    oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
      name: Buffer.from("q1"),
      metadata: Buffer.from(""),
      reward: new anchor.BN(1),
      slashingEnabled: false,
      minStake: new anchor.BN(0),
      authority: payerKeypair.publicKey,
      mint: MINT,
    });

    oracles = new Array();

    for (var i = 0; i < numOracles; i++) {
      let oracle = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracle.publicKey,
        }
      );

      await heartbeatPermissionAccount.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });
      oracles.push(oracle);
    }

    await Promise.all(
      oracles.map(async (o) => {
        await o.heartbeat(payerKeypair);
      })
    );
  });

  it("Batchsize > MinRequiredOracleResults", async () => {
    aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
      name: Buffer.from("BTC_USD"),
      batchSize: numOracles,
      minRequiredOracleResults: 2,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 5,
      queueAccount: oracleQueueAccount,
    });
    await aggregatorAccount.addJob(job1);

    const switchTokenMint = await programStateAccount.getTokenMint();
    const publisher = await switchTokenMint.createAccount(
      payerKeypair.publicKey
    );

    await programStateAccount.vaultTransfer(publisher, payerKeypair, {
      amount: new anchor.BN(15000),
    });

    let leaseAccount = await sbv2.LeaseAccount.create(program, {
      loadAmount: new anchor.BN(10000),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount,
      aggregatorAccount,
    });

    await setupPermissions(oracleQueueAccount, aggregatorAccount, payerKeypair);

    await aggregatorAccount.openRound({
      oracleQueueAccount: oracleQueueAccount,
      payoutWallet: payoutWallet,
    });

    let jobs = await aggregatorAccount.loadJobs();

    let successes = 0;
    let failures = 0;
    for (var i = 0; i < oracles.length; i++) {
      try {
        await aggregatorAccount.saveResult(
          await aggregatorAccount.loadData(),
          oracles[i],
          {
            oracleIdx: await aggregatorAccount.getOracleIndex(
              oracles[i].publicKey
            ),
            error: false,
            value: new Big(5),
            minResponse: new Big(4),
            maxResponse: new Big(6),
            jobs: jobs,
            queueAuthority: payerKeypair.publicKey,
            tokenMint: MINT,
            oracles: [],
          }
        );
        successes += 1;
      } catch (e) {
        console.log("An err!");
        console.log(e);
        failures += 1;
      }

      let rewarded = 0;
      let unrewarded = 0;
      for (var j = 1; j < oracles.length; j++) {
        let oracleWallet = (await oracles[j].loadData()).tokenAccount;
        let newBalance = await provider.connection.getTokenAccountBalance(
          oracleWallet
        );
        if (parseInt(newBalance.value.amount) === 0) {
          unrewarded += 1;
        } else if (parseInt(newBalance.value.amount) === 1) {
          rewarded += 1;
        } else {
          throw "Unexpected balance value";
        }
      }
      assert(rewarded === i);
    }

    assert(successes === numOracles);
  });

  it("Batchsize == MinRequiredOracleResults", async () => {
    aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
      name: Buffer.from("BTC_USD"),
      batchSize: numOracles,
      minRequiredOracleResults: numOracles,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 5,
      queueAccount: oracleQueueAccount,
    });
    await aggregatorAccount.addJob(job1);

    const switchTokenMint = await programStateAccount.getTokenMint();
    const publisher = await switchTokenMint.createAccount(
      payerKeypair.publicKey
    );

    await programStateAccount.vaultTransfer(publisher, payerKeypair, {
      amount: new anchor.BN(15000),
    });

    let leaseAccount = await sbv2.LeaseAccount.create(program, {
      loadAmount: new anchor.BN(10000),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount,
      aggregatorAccount,
    });

    await setupPermissions(oracleQueueAccount, aggregatorAccount, payerKeypair);

    await aggregatorAccount.openRound({
      oracleQueueAccount: oracleQueueAccount,
      payoutWallet: payoutWallet,
    });

    let jobs = await aggregatorAccount.loadJobs();

    /*for (var i = 0; i < oracles.length; i++) {
      let oracleWallet = (await oracles[i].loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(oracleWallet);
      console.log(`balance: ${newBalance.value.amount}`);
    }*/

    let successes = 0;
    let failures = 0;
    for (var i = 0; i < oracles.length; i++) {
      try {
        await aggregatorAccount.saveResult(
          await aggregatorAccount.loadData(),
          oracles[i],
          {
            oracleIdx: await aggregatorAccount.getOracleIndex(
              oracles[i].publicKey
            ),
            error: false,
            value: new Big(5),
            minResponse: new Big(4),
            maxResponse: new Big(6),
            jobs: jobs,
            queueAuthority: payerKeypair.publicKey,
            tokenMint: MINT,
            oracles: [],
          }
        );
        successes += 1;
      } catch (e) {
        console.log("an err!");
        console.log(e);
        failures += 1;
      }
      for (var j = 0; j < oracles.length; j++) {
        let oracleWallet = (await oracles[j].loadData()).tokenAccount;
        let newBalance = await provider.connection.getTokenAccountBalance(
          oracleWallet
        );
        if (i < oracles.length - 1) {
          assert(parseInt(newBalance.value.amount) === 0);
        }
      }
    }

    assert(successes === numOracles);
    for (var i = 0; i < oracles.length; i++) {
      let oracleWallet = (await oracles[i].loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      assert(parseInt(newBalance.value.amount) === 1);
    }
  });
});
