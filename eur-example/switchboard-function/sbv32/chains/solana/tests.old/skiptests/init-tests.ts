import "mocha";
var assert = require("assert");
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import { OracleJob } from "@switchboard-xyz/switchboard-api";
import { Keypair, PublicKey } from "@solana/web3.js";

// function stringify(circ) {
// var cache = [];
// console.log(JSON.stringify(circ, (key, value) => {
// if (typeof value === 'object' && value !== null) {
// // Duplicate reference found, discard key
// if (cache.includes(value)) return;
//
// // Store value in our collection
// cache.push(value);
// }
// return value;
// }, 2));
// }
//
describe("Initializations", async () => {
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const program = anchor.workspace.SwitchboardV2;
  const [programStateAccount, sbump] =
    await sbv2.ProgramStateAccount.getOrCreate(program, {});
  const switchTokenMint = await programStateAccount.getTokenMint();
  const MINT = switchTokenMint.publicKey;

  it("Creates an Aggregator", async () => {});

  it("Creates a Job", async () => {
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
    let account = await sbv2.JobAccount.create(program, {
      name: Buffer.from("switch"),
      expiration: new anchor.BN(0),
      data: buffer,
      authority: sbv2.programWallet(program).publicKey,
    });

    let job = await account.loadData();

    let id = Buffer.from(job.name).toString("utf8").split("\0")[0];
    assert.equal(id, "switch");
    assert.ok(new anchor.BN(job.expiration).eq(new anchor.BN(0)));
    assert.ok(job.data.equals(buffer));
  });

  it("Creates an Oracle Queue and aggregator", async () => {
    let queueAccount = await sbv2.OracleQueueAccount.create(program, {
      name: Buffer.from(""),
      metadata: Buffer.from(""),
      slashingEnabled: false,
      reward: new anchor.BN(0),
      minStake: new anchor.BN(0),
      authority: program.provider.wallet.publicKey,
      mint: MINT,
    });

    let queue = await queueAccount.loadData();
    let aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
      queueAccount,
      name: Buffer.from("BTC_USD"),
      batchSize: 1,
      minRequiredOracleResults: 1,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 10,
    });

    let aggregator = await aggregatorAccount.loadData();
    // stringify(aggregator);
    let id = Buffer.from(aggregator.name).toString("utf8").split("\0")[0];
    assert.equal(id, "BTC_USD");
    assert.equal(aggregator.oracleRequestBatchSize, 1);
    assert.equal(aggregator.minOracleResults, 1);
    const ZERO = new sbv2.SwitchboardDecimal(new anchor.BN(0), 0);
    assert.ok(
      sbv2.SwitchboardDecimal.from(aggregator.varianceThreshold).eq(ZERO)
    );
    assert.equal(aggregator.forceReportPeriod, 0);
    assert.equal(aggregator.expiration, 0);
  });

  it("Creates a Permission", async () => {
    const granter = anchor.web3.Keypair.generate();
    const grantee = anchor.web3.Keypair.generate();
    let permissionAccount = await sbv2.PermissionAccount.create(program, {
      authority: granter.publicKey,
      granter: granter.publicKey,
      grantee: grantee.publicKey,
    });

    let permission = await permissionAccount.loadData();
    // stringify(permission);

    // let id = Buffer.from(job.name).toString('utf8').split("\0")[0];
    // assert.equal(id, "switch");
    // assert.ok(new anchor.BN(job.expiration).eq(new anchor.BN(0)));
    // assert.ok(job.data.equals(buffer));
  });

  it("Creates a Lease", async () => {
    const payerKeypair = Keypair.fromSecretKey(
      (program.provider.wallet as any).payer.secretKey
    );
    const queueAccount = await sbv2.OracleQueueAccount.create(program, {
      name: Buffer.from(""),
      metadata: Buffer.from(""),
      slashingEnabled: false,
      reward: new anchor.BN(1),
      minStake: new anchor.BN(0),
      authority: program.provider.wallet.publicKey,
      mint: MINT,
    });
    const aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
      queueAccount,
      name: Buffer.from("BTC_USD"),
      batchSize: 1,
      minRequiredOracleResults: 1,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 10,
    });
    const publisher = await switchTokenMint.createAccount(
      program.provider.wallet.publicKey
    );
    await programStateAccount.vaultTransfer(publisher, payerKeypair, {
      amount: new anchor.BN(1000),
    });
    let leaseAccount = await sbv2.LeaseAccount.create(program, {
      loadAmount: new anchor.BN(1),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount: queueAccount,
      aggregatorAccount,
    });
  });

  it("Creates an Oracle Queue", async () => {
    let account = await sbv2.OracleQueueAccount.create(program, {
      name: Buffer.from(""),
      metadata: Buffer.from(""),
      slashingEnabled: false,
      reward: new anchor.BN(0),
      minStake: new anchor.BN(0),
      authority: program.provider.wallet.publicKey,
      mint: MINT,
    });

    let queue = await account.loadData();
  });

  it("Creates a Crank", async () => {
    const queueAccount = await sbv2.OracleQueueAccount.create(program, {
      name: Buffer.from(""),
      metadata: Buffer.from(""),
      slashingEnabled: false,
      reward: new anchor.BN(1),
      minStake: new anchor.BN(0),
      authority: program.provider.wallet.publicKey,
      mint: MINT,
    });
    let account = await sbv2.CrankAccount.create(program, {
      name: Buffer.from(""),
      metadata: Buffer.from(""),
      queueAccount,
    });

    let queue = await account.loadData();
  });
});
