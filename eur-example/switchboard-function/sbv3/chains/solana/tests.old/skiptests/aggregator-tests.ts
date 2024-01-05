import "mocha";
const chai = require("chai");
const expect = chai.expect;
var assert = require("assert");
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import { OracleJob } from "@switchboard-xyz/switchboard-api";
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

describe("Aggregator tests", () => {
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  console.log(anchor);
  const program = anchor.workspace.SwitchboardV2;

  let programStateAccount: sbv2.ProgramStateAccount;
  let MINT: PublicKey;
  let sbump;
  let tasks;
  let job1: sbv2.JobAccount;
  let aggregatorAccount: sbv2.AggregatorAccount;
  let oracleQueueAccount: sbv2.OracleQueueAccount;
  let payoutKeypair = anchor.web3.Keypair.generate();
  let payoutWallet: PublicKey;
  let oracleAccount: sbv2.OracleAccount;
  let aggregatorPermissionAccount: sbv2.PermissionAccount;
  const payerKeypair = Keypair.fromSecretKey(
    (program.provider.wallet as any).payer.secretKey
  );

  before(async () => {
    [programStateAccount] = await sbv2.ProgramStateAccount.getOrCreate(
      program,
      {}
    );
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
      authority: payerKeypair.publicKey,
    });
  });

  beforeEach(async () => {
    [programStateAccount] = await sbv2.ProgramStateAccount.getOrCreate(
      program,
      {}
    );
    MINT = (await programStateAccount.getTokenMint()).publicKey;
    oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
      name: Buffer.from("q1"),
      metadata: Buffer.from(""),
      reward: new anchor.BN(1),
      slashingEnabled: false,
      minStake: new anchor.BN(0),
      authority: payerKeypair.publicKey,
      mint: MINT,
    });
    aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
      name: Buffer.from("BTC_USD"),
      batchSize: 1,
      minRequiredOracleResults: 1,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 5,
      queueAccount: oracleQueueAccount,
    });
    const switchTokenMint = await programStateAccount.getTokenMint();

    payoutKeypair = anchor.web3.Keypair.generate();
    payoutWallet = await switchTokenMint.createAccount(payoutKeypair.publicKey);
  });

  it("Adds a job to the Aggregator", async () => {
    aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
      name: Buffer.from("BTC_USD"),
      batchSize: 1,
      minRequiredOracleResults: 1,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 5,
      queueAccount: oracleQueueAccount,
      authority: payerKeypair.publicKey,
    });
    let aggregatorData = await aggregatorAccount.loadData();
    assert(aggregatorData.jobPubkeysData[0].equals(PublicKey.default));
    assert(aggregatorData.jobPubkeysSize === 0);
    await aggregatorAccount.addJob(job1, payerKeypair);
    aggregatorData = await aggregatorAccount.loadData();
    assert(aggregatorData.jobPubkeysData[0].equals(job1.publicKey));
    assert(aggregatorData.jobPubkeysSize === 1);
    await aggregatorAccount.lock(payerKeypair);

    assert.rejects(
      async () => {
        await aggregatorAccount.addJob(job1, payerKeypair);
      },
      { code: 338 }
    );
  });

  it("Opens a round", async () => {
    const switchTokenMint = await programStateAccount.getTokenMint();
    const publisher = await switchTokenMint.createAccount(
      payerKeypair.publicKey
    );

    await programStateAccount.vaultTransfer(publisher, payerKeypair, {
      amount: new anchor.BN(100),
    });

    let leaseAccount = await sbv2.LeaseAccount.create(program, {
      loadAmount: new anchor.BN(15),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount,
      aggregatorAccount,
    });

    let oracleAccount = await sbv2.OracleAccount.create(program, {
      queueAccount: oracleQueueAccount,
    });
    let oracleAccount2 = await sbv2.OracleAccount.create(program, {
      queueAccount: oracleQueueAccount,
    });

    let aggregatorPermissionAccount = await sbv2.PermissionAccount.create(
      program,
      {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: aggregatorAccount.publicKey,
      }
    );
    await aggregatorPermissionAccount.set({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
      authority: payerKeypair,
      enable: true,
    });
    let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
      program,
      {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: oracleAccount.publicKey,
      }
    );
    await heartbeatPermissionAccount.set({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
      authority: payerKeypair,
      enable: true,
    });
    let heartbeatPermissionAccount2 = await sbv2.PermissionAccount.create(
      program,
      {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: oracleAccount2.publicKey,
      }
    );
    await heartbeatPermissionAccount2.set({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
      authority: payerKeypair,
      enable: true,
    });

    await oracleAccount.heartbeat(payerKeypair);
    await oracleAccount2.heartbeat(payerKeypair);

    let aggregatorData = await aggregatorAccount.loadData();
    let leaseData = await leaseAccount.loadData();
    let prevLeaseUpdateCount = leaseData.updateCount;
    let prevOpenTimestamp = aggregatorData.currentRound.roundOpenTimestamp;
    let prevNextAllowedUpdateTime = aggregatorData.nextAllowedUpdateTime;
    let oracleQueueData = await oracleQueueAccount.loadData();
    let prevOracleQueueIdx = oracleQueueData.currIdx;
    let prevTokenBalance = await provider.connection.getTokenAccountBalance(
      payoutWallet
    );

    await aggregatorAccount.addJob(job1);
    await aggregatorAccount.openRound({
      oracleQueueAccount: oracleQueueAccount,
      payoutWallet: payoutWallet,
    });
    aggregatorData = await aggregatorAccount.loadData();
    leaseData = await leaseAccount.loadData();
    oracleQueueData = await oracleQueueAccount.loadData();

    let tokenBalance = await provider.connection.getTokenAccountBalance(
      payoutWallet
    );

    assert(tokenBalance.value.uiAmount > prevTokenBalance.value.uiAmount);
    assert(prevOracleQueueIdx === oracleQueueData.currIdx - 1);
    assert(
      leaseData.updateCount.eq(prevLeaseUpdateCount.add(new anchor.BN(1)))
    );
    assert(aggregatorData.nextAllowedUpdateTime !== prevNextAllowedUpdateTime);
    assert(
      aggregatorData.currentRound.roundOpenTimestamp !== prevOpenTimestamp
    );
  });

  it("Saves result on an open round", async () => {
    const switchTokenMint = await programStateAccount.getTokenMint();
    const publisher = await switchTokenMint.createAccount(
      payerKeypair.publicKey
    );

    await programStateAccount.vaultTransfer(publisher, payerKeypair, {
      amount: new anchor.BN(100),
    });

    // oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
    // name: Buffer.from("q1"),
    // metadata: Buffer.from(""),
    // reward: new anchor.BN(1),
    // [>slashingEnabled: false,<]
    // minStake: new anchor.BN(0),
    // authority: payerKeypair.publicKey,
    // });

    let leaseAccount = await sbv2.LeaseAccount.create(program, {
      loadAmount: new anchor.BN(15),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount,
      aggregatorAccount,
    });

    let oracleAccount = await sbv2.OracleAccount.create(program, {
      queueAccount: oracleQueueAccount,
    });

    let aggregatorPermissionAccount = await sbv2.PermissionAccount.create(
      program,
      {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: aggregatorAccount.publicKey,
      }
    );
    await aggregatorPermissionAccount.set({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
      authority: payerKeypair,
      enable: true,
    });
    let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
      program,
      {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: oracleAccount.publicKey,
      }
    );
    await heartbeatPermissionAccount.set({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
      authority: payerKeypair,
      enable: true,
    });

    await oracleAccount.heartbeat(payerKeypair);

    await aggregatorAccount.addJob(job1);
    await aggregatorAccount.openRound({
      oracleQueueAccount: oracleQueueAccount,
      payoutWallet: payoutWallet,
    });

    let idx = await aggregatorAccount.getOracleIndex(oracleAccount.publicKey);
    let jobs = await aggregatorAccount.loadJobs();
    let queue = await oracleQueueAccount.loadData();
    let mint = await oracleQueueAccount.loadMint();

    await aggregatorAccount.saveResult(
      await aggregatorAccount.loadData(),
      oracleAccount,
      {
        oracleIdx: idx,
        error: false,
        value: new Big(5),
        minResponse: new Big(4),
        maxResponse: new Big(6),
        jobs: jobs,
        queueAuthority: queue.authority,
        tokenMint: mint.publicKey,
        oracles: [],
      }
    );

    let aggregatorData = await aggregatorAccount.loadData();
    assert(
      sbv2.SwitchboardDecimal.from(
        aggregatorData.currentRound.mediansData[idx]
      ).eq(sbv2.SwitchboardDecimal.fromBig(new Big(5)))
    );
    assert(aggregatorData.currentRound.mediansFulfilled[idx]);
    assert(aggregatorData.currentRound.numSuccess === 1);
    assert(
      sbv2.SwitchboardDecimal.from(aggregatorData.currentRound.minResponse).eq(
        sbv2.SwitchboardDecimal.fromBig(new Big(4))
      )
    );
    assert(
      sbv2.SwitchboardDecimal.from(aggregatorData.currentRound.maxResponse).eq(
        sbv2.SwitchboardDecimal.fromBig(new Big(6))
      )
    );
  });

  it("Validates an Aggregator job limit", async () => {
    // One job already inserted in setup
    for (let i = 0; i < 16; ++i) {
      await aggregatorAccount.addJob(job1);
    }
    await assert.rejects(async () => {
      await aggregatorAccount.addJob(job1);
    }); // code 6010
  });

  it("Does a multijob checksum check", async () => {
    for (let i = 0; i < 16; ++i) {
      await aggregatorAccount.addJob(job1);
    }
    //
    // oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
    // name: Buffer.from("q1"),
    // metadata: Buffer.from(""),
    // reward: new anchor.BN(1),
    // slashingEnabled: false,
    // minStake: new anchor.BN(0),
    // authority: payerKeypair.publicKey,
    // });
    let oracleAccount = await sbv2.OracleAccount.create(program, {
      queueAccount: oracleQueueAccount,
    });
    let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
      program,
      {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: oracleAccount.publicKey,
      }
    );
    await heartbeatPermissionAccount.set({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
      authority: payerKeypair,
      enable: true,
    });
    await oracleAccount.heartbeat(payerKeypair);
    const switchTokenMint = await programStateAccount.getTokenMint();
    const publisher = await switchTokenMint.createAccount(
      payerKeypair.publicKey
    );
    await programStateAccount.vaultTransfer(publisher, payerKeypair, {
      amount: new anchor.BN(100),
    });
    aggregatorPermissionAccount = await sbv2.PermissionAccount.create(program, {
      authority: payerKeypair.publicKey,
      granter: oracleQueueAccount.publicKey,
      grantee: aggregatorAccount.publicKey,
    });
    await aggregatorPermissionAccount.set({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
      authority: payerKeypair,
      enable: true,
    });
    let leaseAccount = await sbv2.LeaseAccount.create(program, {
      loadAmount: new anchor.BN(15),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount,
      aggregatorAccount,
    });
    await aggregatorAccount.openRound({
      oracleQueueAccount: oracleQueueAccount,
      payoutWallet: payoutWallet,
    });

    const aggregator = await aggregatorAccount.loadData();
    const jobs = await aggregatorAccount.loadJobs();
    const hash = crypto.createHash("sha256");
    for (let idx in jobs) {
      const job = jobs[idx];
      const jobHasher = crypto.createHash("sha256");
      jobHasher.update(OracleJob.encodeDelimited(job).finish());
      const digest = jobHasher.digest();
      hash.update(digest);
    }
    const queue = await oracleQueueAccount.loadData();
    const mint = await oracleQueueAccount.loadMint();
    await aggregatorAccount.saveResult(aggregator, oracleAccount, {
      oracleIdx: 0,
      jobs: jobs,
      error: false,
      value: new Big(10),
      minResponse: new Big(5),
      maxResponse: new Big(50),
      queueAuthority: queue.authority,
      tokenMint: mint.publicKey,
      oracles: [],
    });
  });

  describe("Save Result Tests", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let oracleAccount: sbv2.OracleAccount;
    let oracleAccount2: sbv2.OracleAccount;
    let oracleAccount3: sbv2.OracleAccount;
    let aggregatorAccount: sbv2.AggregatorAccount;
    let lease: sbv2.LeaseAccount;
    let publisher: PublicKey;
    let switchTokenMint: spl.Token;
    let crankTurnerKeypair: Keypair;
    let crankTurnerWallet: PublicKey;
    let aggregatorPermission: sbv2.PermissionAccount;
    beforeEach(async () => {
      let [programStateAccount] = await sbv2.ProgramStateAccount.getOrCreate(
        program,
        {}
      );
      switchTokenMint = await programStateAccount.getTokenMint();

      publisher = await switchTokenMint.createAccount(payerKeypair.publicKey);

      crankTurnerKeypair = anchor.web3.Keypair.generate();
      crankTurnerWallet = await switchTokenMint.createAccount(
        crankTurnerKeypair.publicKey
      );

      await programStateAccount.vaultTransfer(publisher, payerKeypair, {
        amount: new anchor.BN(100),
      });

      oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
        name: Buffer.from("q1"),
        metadata: Buffer.from(""),
        reward: new anchor.BN(1),
        slashingEnabled: true,
        minStake: new anchor.BN(5),
        authority: payerKeypair.publicKey,
        feedProbationPeriod: 2,
        consecutiveFeedFailureLimit: new anchor.BN(1),
        varianceToleranceMultiplier: 1,
        mint: MINT,
      });

      oracleAccount = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData = await oracleAccount.loadData();

      oracleAccount2 = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData2 = await oracleAccount2.loadData();

      oracleAccount3 = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData3 = await oracleAccount3.loadData();

      await programStateAccount.vaultTransfer(
        oracleAccountData.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(100),
        }
      );
      await programStateAccount.vaultTransfer(
        oracleAccountData2.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(100),
        }
      );
      await programStateAccount.vaultTransfer(
        oracleAccountData3.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(100),
        }
      );

      let tasks = [
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

      let job1 = await sbv2.JobAccount.create(program, {
        name: Buffer.from("switch"),
        expiration: new anchor.BN(0),
        data: buffer,
        authority: payerKeypair.publicKey,
      });

      aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
        name: Buffer.from("BTC_USD"),
        batchSize: 3,
        minRequiredOracleResults: 2,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
        queueAccount: oracleQueueAccount,
      });

      await aggregatorAccount.addJob(job1);

      lease = await sbv2.LeaseAccount.create(program, {
        loadAmount: new anchor.BN(15),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount,
      });

      //await setupPermissions(oracleQueueAccount, aggregatorAccount, payerKeypair);
      aggregatorPermission = await sbv2.PermissionAccount.create(program, {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: aggregatorAccount.publicKey,
      });
      await aggregatorPermission.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount.publicKey,
        }
      );

      await heartbeatPermissionAccount.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount2 = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount2.publicKey,
        }
      );

      await heartbeatPermissionAccount2.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount3 = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount3.publicKey,
        }
      );

      await heartbeatPermissionAccount3.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      await oracleAccount.heartbeat(payerKeypair);
      await oracleAccount2.heartbeat(payerKeypair);
      await oracleAccount3.heartbeat(payerKeypair);
    });

    it("Feed Permission Revoked After Violating Probation Invariant", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      let permissionData = await aggregatorPermission.loadData();
      assert(permissionData.permissions === 2);
      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: true,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });
      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: true,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });
      permissionData = await aggregatorPermission.loadData();
      assert(permissionData.permissions === 0);
    });

    it("Feed Retains Permission After Consecutive Succesful SaveResults during Probation Period", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: false,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });
      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: false,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      console.log("waiting ten seconds...");
      await sleep(10000);

      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      agData = await aggregatorAccount.loadData();
      jobs = await aggregatorAccount.loadJobs();

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: false,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });
      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: false,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      console.log("waiting ten seconds...");
      await sleep(10000);

      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      agData = await aggregatorAccount.loadData();
      jobs = await aggregatorAccount.loadJobs();

      let permissionData = await aggregatorPermission.loadData();
      assert(permissionData.permissions === 2);
      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: true,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });
      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: true,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      permissionData = await aggregatorPermission.loadData();
      assert(permissionData.permissions === 2);
    });

    it("Neither Pays Nor Slashes Error Responses", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      let oracleWallet = (await oracleAccount.loadData()).tokenAccount;
      let oldBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: true,
        value: Big(2),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });
      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: true,
        value: Big(100000000),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      oracleWallet = (await oracleAccount.loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      assert(oldBalance.value.uiAmount === newBalance.value.uiAmount);
    });

    it("Rewards Oracles Who Respond Within Threshold", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      let oracleWallet = (await oracleAccount.loadData()).tokenAccount;
      let oldBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let oldBalanceValue = parseInt(oldBalance.value.amount);

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: false,
        value: Big(5),
        minResponse: Big(4),
        maxResponse: Big(6),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });
      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: false,
        value: Big(5),
        minResponse: Big(4),
        maxResponse: Big(6),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      oracleWallet = (await oracleAccount.loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let newBalanceValue = parseInt(newBalance.value.amount);
      assert(newBalanceValue === oldBalanceValue + 1);
    });

    it("Slashes Oracles Who Respond Outside Threshold", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: false,
        value: Big(10),
        minResponse: Big(5),
        maxResponse: Big(15),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      agData = await aggregatorAccount.loadData();

      let oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let oldBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let oldBalanceValue = parseInt(oldBalance.value.amount);

      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: false,
        value: Big(10000000000),
        minResponse: Big(2),
        maxResponse: Big(20),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      await aggregatorAccount.saveResult(agData, oracleAccount3, {
        oracleIdx: 2,
        error: false,
        value: Big(2),
        minResponse: Big(2),
        maxResponse: Big(20),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let newBalanceValue = parseInt(newBalance.value.amount);

      assert(newBalanceValue === oldBalanceValue - 1);
    });

    it("Fails When Job Hashes Don't Match", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      let tasks = [
        OracleJob.Task.create({
          httpTask: OracleJob.HttpTask.create({
            url: `FakeUrl.com`,
          }),
        }),
        OracleJob.Task.create({
          jsonParseTask: OracleJob.JsonParseTask.create({
            path: "$.fakeField",
          }),
        }),
      ];

      let buffer = Buffer.from(
        OracleJob.encodeDelimited(OracleJob.create({ tasks })).finish()
      );

      let fakeJob = await sbv2.JobAccount.create(program, {
        name: Buffer.from("switch"),
        expiration: new anchor.BN(0),
        data: buffer,
        authority: payerKeypair.publicKey,
      });

      let oracleWallet = (await oracleAccount.loadData()).tokenAccount;
      let oldBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );

      await assert.rejects(
        async () => {
          await aggregatorAccount.saveResult(agData, oracleAccount, {
            oracleIdx: 0,
            error: false,
            value: Big(0),
            minResponse: Big(0),
            maxResponse: Big(0),
            jobs: [OracleJob.create({ tasks })],
            queueAuthority: payerKeypair.publicKey,
            tokenMint: MINT,
            oracles: [],
          });
        } /*, {code: 340}*/
      );
    });
  });

  describe("No Slashing", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let oracleAccount: sbv2.OracleAccount;
    let oracleAccount2: sbv2.OracleAccount;
    let oracleAccount3: sbv2.OracleAccount;
    let aggregatorAccount: sbv2.AggregatorAccount;
    let lease: sbv2.LeaseAccount;
    let publisher: PublicKey;
    let switchTokenMint: spl.Token;
    let crankTurnerKeypair: Keypair;
    let crankTurnerWallet: PublicKey;
    let aggregatorPermission: sbv2.PermissionAccount;
    beforeEach(async () => {
      switchTokenMint = await programStateAccount.getTokenMint();

      publisher = await switchTokenMint.createAccount(payerKeypair.publicKey);

      crankTurnerKeypair = anchor.web3.Keypair.generate();
      crankTurnerWallet = await switchTokenMint.createAccount(
        crankTurnerKeypair.publicKey
      );

      await programStateAccount.vaultTransfer(publisher, payerKeypair, {
        amount: new anchor.BN(100),
      });

      oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
        name: Buffer.from("q1"),
        metadata: Buffer.from(""),
        reward: new anchor.BN(1),
        slashingEnabled: false,
        minStake: new anchor.BN(5),
        authority: payerKeypair.publicKey,
        feedProbationPeriod: 2,
        consecutiveFeedFailureLimit: new anchor.BN(1),
        varianceToleranceMultiplier: 1,
        mint: MINT,
      });

      oracleAccount = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData = await oracleAccount.loadData();

      oracleAccount2 = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData2 = await oracleAccount2.loadData();

      oracleAccount3 = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData3 = await oracleAccount3.loadData();

      await programStateAccount.vaultTransfer(
        oracleAccountData.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(100),
        }
      );
      await programStateAccount.vaultTransfer(
        oracleAccountData2.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(100),
        }
      );
      await programStateAccount.vaultTransfer(
        oracleAccountData3.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(100),
        }
      );

      let tasks = [
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

      let job1 = await sbv2.JobAccount.create(program, {
        name: Buffer.from("switch"),
        expiration: new anchor.BN(0),
        data: buffer,
        authority: payerKeypair.publicKey,
      });

      aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
        name: Buffer.from("BTC_USD"),
        batchSize: 3,
        minRequiredOracleResults: 2,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
        queueAccount: oracleQueueAccount,
      });

      await aggregatorAccount.addJob(job1);

      lease = await sbv2.LeaseAccount.create(program, {
        loadAmount: new anchor.BN(15),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount,
      });

      //await setupPermissions(oracleQueueAccount, aggregatorAccount, payerKeypair);
      aggregatorPermission = await sbv2.PermissionAccount.create(program, {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: aggregatorAccount.publicKey,
      });
      await aggregatorPermission.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount.publicKey,
        }
      );

      await heartbeatPermissionAccount.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount2 = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount2.publicKey,
        }
      );

      await heartbeatPermissionAccount2.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount3 = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount3.publicKey,
        }
      );

      await heartbeatPermissionAccount3.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      await oracleAccount.heartbeat(payerKeypair);
      await oracleAccount2.heartbeat(payerKeypair);
      await oracleAccount3.heartbeat(payerKeypair);
    });

    it("Doesn't Slash if Slashing is Disabled", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: false,
        value: Big(10),
        minResponse: Big(5),
        maxResponse: Big(15),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      agData = await aggregatorAccount.loadData();

      let oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let oldBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let oldBalanceValue = parseInt(oldBalance.value.amount);

      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: false,
        value: Big(9999999999999),
        minResponse: Big(2),
        maxResponse: Big(20),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      await aggregatorAccount.saveResult(agData, oracleAccount3, {
        oracleIdx: 2,
        error: false,
        value: Big(2),
        minResponse: Big(2),
        maxResponse: Big(20),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let newBalanceValue = parseInt(newBalance.value.amount);

      assert(newBalanceValue === oldBalanceValue);
    });
  });

  describe("No Minimum Stake", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let oracleAccount: sbv2.OracleAccount;
    let oracleAccount2: sbv2.OracleAccount;
    let oracleAccount3: sbv2.OracleAccount;
    let aggregatorAccount: sbv2.AggregatorAccount;
    let lease: sbv2.LeaseAccount;
    let publisher: PublicKey;
    let switchTokenMint: spl.Token;
    let crankTurnerKeypair: Keypair;
    let crankTurnerWallet: PublicKey;
    let aggregatorPermission: sbv2.PermissionAccount;
    beforeEach(async () => {
      switchTokenMint = await programStateAccount.getTokenMint();

      publisher = await switchTokenMint.createAccount(payerKeypair.publicKey);

      crankTurnerKeypair = anchor.web3.Keypair.generate();
      crankTurnerWallet = await switchTokenMint.createAccount(
        crankTurnerKeypair.publicKey
      );

      await programStateAccount.vaultTransfer(publisher, payerKeypair, {
        amount: new anchor.BN(100),
      });

      oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
        name: Buffer.from("q1"),
        metadata: Buffer.from(""),
        reward: new anchor.BN(1),
        slashingEnabled: true,
        minStake: new anchor.BN(0),
        authority: payerKeypair.publicKey,
        feedProbationPeriod: 2,
        consecutiveFeedFailureLimit: new anchor.BN(1),
        varianceToleranceMultiplier: 1,
        mint: MINT,
      });

      oracleAccount = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData = await oracleAccount.loadData();

      oracleAccount2 = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData2 = await oracleAccount2.loadData();

      oracleAccount3 = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData3 = await oracleAccount3.loadData();
      // Don't fund them.

      /*await programStateAccount.vaultTransfer(oracleAccountData.tokenAccount, payerKeypair, {
        amount: new anchor.BN(0),
      });
      await programStateAccount.vaultTransfer(oracleAccountData2.tokenAccount, payerKeypair, {
        amount: new anchor.BN(0),
      });
      await programStateAccount.vaultTransfer(oracleAccountData3.tokenAccount, payerKeypair, {
        amount: new anchor.BN(0),
      });*/

      let tasks = [
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

      let job1 = await sbv2.JobAccount.create(program, {
        name: Buffer.from("switch"),
        expiration: new anchor.BN(0),
        data: buffer,
        authority: payerKeypair.publicKey,
      });

      aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
        name: Buffer.from("BTC_USD"),
        batchSize: 3,
        minRequiredOracleResults: 2,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
        queueAccount: oracleQueueAccount,
      });

      await aggregatorAccount.addJob(job1);

      lease = await sbv2.LeaseAccount.create(program, {
        loadAmount: new anchor.BN(50),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount,
      });

      //await setupPermissions(oracleQueueAccount, aggregatorAccount, payerKeypair);
      aggregatorPermission = await sbv2.PermissionAccount.create(program, {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: aggregatorAccount.publicKey,
      });
      await aggregatorPermission.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount.publicKey,
        }
      );

      await heartbeatPermissionAccount.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount2 = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount2.publicKey,
        }
      );

      await heartbeatPermissionAccount2.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount3 = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount3.publicKey,
        }
      );

      await heartbeatPermissionAccount3.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      await oracleAccount.heartbeat(payerKeypair);
      await oracleAccount2.heartbeat(payerKeypair);
      await oracleAccount3.heartbeat(payerKeypair);
    });

    it("What happens if it slashes Oracle with an empty wallet?", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: false,
        value: Big(10),
        minResponse: Big(5),
        maxResponse: Big(15),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      agData = await aggregatorAccount.loadData();

      let oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let oldBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let oldBalanceValue = parseInt(oldBalance.value.amount);

      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: false,
        value: Big(999999999),
        minResponse: Big(5),
        maxResponse: Big(15),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      await aggregatorAccount.saveResult(agData, oracleAccount3, {
        oracleIdx: 2,
        error: false,
        value: Big(10),
        minResponse: Big(5),
        maxResponse: Big(15),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let newBalanceValue = parseInt(newBalance.value.amount);

      assert(newBalanceValue === 0 && oldBalanceValue === 0);
    });
  });

  // skipping because reward gets abs'd on chain
  describe.skip("Reward is Negative", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let oracleAccount: sbv2.OracleAccount;
    let oracleAccount2: sbv2.OracleAccount;
    let aggregatorAccount: sbv2.AggregatorAccount;
    let lease: sbv2.LeaseAccount;
    let publisher: PublicKey;
    let switchTokenMint: spl.Token;
    let crankTurnerKeypair: Keypair;
    let crankTurnerWallet: PublicKey;
    let aggregatorPermission: sbv2.PermissionAccount;
    beforeEach(async () => {
      switchTokenMint = await programStateAccount.getTokenMint();

      publisher = await switchTokenMint.createAccount(payerKeypair.publicKey);

      crankTurnerKeypair = anchor.web3.Keypair.generate();
      crankTurnerWallet = await switchTokenMint.createAccount(
        crankTurnerKeypair.publicKey
      );

      await programStateAccount.vaultTransfer(publisher, payerKeypair, {
        amount: new anchor.BN(100),
      });

      oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
        name: Buffer.from("q1"),
        metadata: Buffer.from(""),
        reward: new anchor.BN(-1),
        slashingEnabled: true,
        minStake: new anchor.BN(5),
        authority: payerKeypair.publicKey,
        feedProbationPeriod: 2,
        consecutiveFeedFailureLimit: new anchor.BN(1),
        mint: MINT,
      });

      oracleAccount = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData = await oracleAccount.loadData();

      oracleAccount2 = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData2 = await oracleAccount2.loadData();

      await programStateAccount.vaultTransfer(
        oracleAccountData.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(100),
        }
      );
      await programStateAccount.vaultTransfer(
        oracleAccountData2.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(100),
        }
      );

      let tasks = [
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

      let job1 = await sbv2.JobAccount.create(program, {
        name: Buffer.from("switch"),
        expiration: new anchor.BN(0),
        data: buffer,
        authority: payerKeypair.publicKey,
      });

      aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
        name: Buffer.from("BTC_USD"),
        batchSize: 2,
        minRequiredOracleResults: 2,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
        queueAccount: oracleQueueAccount,
      });

      await aggregatorAccount.addJob(job1);

      lease = await sbv2.LeaseAccount.create(program, {
        loadAmount: new anchor.BN(15),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount,
      });

      //await setupPermissions(oracleQueueAccount, aggregatorAccount, payerKeypair);
      aggregatorPermission = await sbv2.PermissionAccount.create(program, {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: aggregatorAccount.publicKey,
      });
      await aggregatorPermission.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount.publicKey,
        }
      );

      await heartbeatPermissionAccount.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount2 = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount2.publicKey,
        }
      );

      await heartbeatPermissionAccount2.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      await oracleAccount.heartbeat(payerKeypair);
      await oracleAccount2.heartbeat(payerKeypair);
    });

    it("What happens to misbehaving Oracles if reward is negative?", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: false,
        value: Big(10),
        minResponse: Big(5),
        maxResponse: Big(15),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      agData = await aggregatorAccount.loadData();

      let oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let oldBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );

      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: false,
        value: Big(2),
        minResponse: Big(3),
        maxResponse: Big(20),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let oldBalanceVal = parseInt(oldBalance.value.amount);
      let newBalanceVal = parseInt(newBalance.value.amount);
      assert(newBalanceVal === oldBalanceVal - 1);
    });

    it("Oracles get rewarded the absolute value of reward if it's negative", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: false,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      agData = await aggregatorAccount.loadData();

      let oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let oldBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );

      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: false,
        value: Big(0),
        minResponse: Big(0),
        maxResponse: Big(0),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let oldBalanceVal = parseInt(oldBalance.value.amount);
      let newBalanceVal = parseInt(newBalance.value.amount);
      assert(newBalanceVal === oldBalanceVal + 1);
    });
  });

  describe.skip("Reward is more than min stake", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let oracleAccount: sbv2.OracleAccount;
    let oracleAccount2: sbv2.OracleAccount;
    let oracleAccount3: sbv2.OracleAccount;
    let aggregatorAccount: sbv2.AggregatorAccount;
    let lease: sbv2.LeaseAccount;
    let publisher: PublicKey;
    let switchTokenMint: spl.Token;
    let crankTurnerKeypair: Keypair;
    let crankTurnerWallet: PublicKey;
    let aggregatorPermission: sbv2.PermissionAccount;
    beforeEach(async () => {
      switchTokenMint = await programStateAccount.getTokenMint();

      publisher = await switchTokenMint.createAccount(payerKeypair.publicKey);

      crankTurnerKeypair = anchor.web3.Keypair.generate();
      crankTurnerWallet = await switchTokenMint.createAccount(
        crankTurnerKeypair.publicKey
      );

      await programStateAccount.vaultTransfer(publisher, payerKeypair, {
        amount: new anchor.BN(100),
      });

      oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
        name: Buffer.from("q1"),
        metadata: Buffer.from(""),
        reward: new anchor.BN(5),
        slashingEnabled: true,
        minStake: new anchor.BN(1),
        authority: payerKeypair.publicKey,
        feedProbationPeriod: 2,
        consecutiveFeedFailureLimit: new anchor.BN(1),
        varianceToleranceMultiplier: 1,
        mint: MINT,
      });

      oracleAccount = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData = await oracleAccount.loadData();

      oracleAccount2 = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData2 = await oracleAccount2.loadData();

      oracleAccount3 = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });

      let oracleAccountData3 = await oracleAccount3.loadData();

      await programStateAccount.vaultTransfer(
        oracleAccountData.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(1),
        }
      );
      await programStateAccount.vaultTransfer(
        oracleAccountData2.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(1),
        }
      );
      await programStateAccount.vaultTransfer(
        oracleAccountData3.tokenAccount,
        payerKeypair,
        {
          amount: new anchor.BN(1),
        }
      );

      let tasks = [
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

      let job1 = await sbv2.JobAccount.create(program, {
        name: Buffer.from("switch"),
        expiration: new anchor.BN(0),
        data: buffer,
        authority: payerKeypair.publicKey,
      });

      aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
        name: Buffer.from("BTC_USD"),
        batchSize: 3,
        minRequiredOracleResults: 2,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
        queueAccount: oracleQueueAccount,
      });

      await aggregatorAccount.addJob(job1);

      lease = await sbv2.LeaseAccount.create(program, {
        loadAmount: new anchor.BN(100),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount,
      });

      //await setupPermissions(oracleQueueAccount, aggregatorAccount, payerKeypair);
      aggregatorPermission = await sbv2.PermissionAccount.create(program, {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: aggregatorAccount.publicKey,
      });
      await aggregatorPermission.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount.publicKey,
        }
      );

      await heartbeatPermissionAccount.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount2 = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount2.publicKey,
        }
      );

      await heartbeatPermissionAccount2.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      let heartbeatPermissionAccount3 = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount3.publicKey,
        }
      );

      await heartbeatPermissionAccount3.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: true,
      });

      await oracleAccount.heartbeat(payerKeypair);
      await oracleAccount2.heartbeat(payerKeypair);
      await oracleAccount3.heartbeat(payerKeypair);
    });

    it("What happens if MinStake < Reward", async () => {
      await aggregatorAccount.openRound({
        oracleQueueAccount: oracleQueueAccount,
        payoutWallet: crankTurnerWallet,
      });

      let agData = await aggregatorAccount.loadData();
      let jobs = await aggregatorAccount.loadJobs();

      await aggregatorAccount.saveResult(agData, oracleAccount, {
        oracleIdx: 0,
        error: false,
        value: Big(7),
        minResponse: Big(4),
        maxResponse: Big(10),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      agData = await aggregatorAccount.loadData();

      let oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let oldBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );

      await aggregatorAccount.saveResult(agData, oracleAccount2, {
        oracleIdx: 1,
        error: false,
        value: Big(1000),
        minResponse: Big(4),
        maxResponse: Big(10),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      await aggregatorAccount.saveResult(agData, oracleAccount3, {
        oracleIdx: 2,
        error: false,
        value: Big(7),
        minResponse: Big(4),
        maxResponse: Big(10),
        jobs: jobs,
        queueAuthority: payerKeypair.publicKey,
        tokenMint: MINT,
        oracles: [],
      });

      oracleWallet = (await oracleAccount2.loadData()).tokenAccount;
      let newBalance = await provider.connection.getTokenAccountBalance(
        oracleWallet
      );
      let oldBalanceVal = parseInt(oldBalance.value.amount);
      let newBalanceVal = parseInt(newBalance.value.amount);
    });
  });
});
