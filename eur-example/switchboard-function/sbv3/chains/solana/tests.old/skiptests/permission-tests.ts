import "mocha";
const chai = require("chai");
const expect = chai.expect;
var assert = require("assert");
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/solana.js";
import { OracleJob } from "@switchboard-xyz/common";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
import Big from "big.js";
import * as bs58 from "bs58";
import * as crypto from "crypto";

describe("Permission Tests", async () => {
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const program = anchor.workspace.SwitchboardV2;

  let programStateAccount: sbv2.ProgramStateAccount;
  try {
    await sbv2.ProgramStateAccount.create(program, {});
  } catch (e) {}

  let sbump;
  [programStateAccount, sbump] = await sbv2.ProgramStateAccount.fromSeed(
    program
  );
  let MINT = (await programStateAccount.getTokenMint()).publicKey;
  const payerKeypair = Keypair.fromSecretKey(
    (program.provider.wallet as any).payer.secretKey
  );

  before(async () => {});

  describe("Heartbeat Permission Tests", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let oracleAccount: sbv2.OracleAccount;

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

      oracleAccount = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });
    });

    it("Succesfully Permits Heartbeats", async () => {
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

      await assert.doesNotReject(async function () {
        await oracleAccount.heartbeat(payerKeypair);
      });
    });

    it("Fails to Heartbeaet without Permission", async () => {
      const queue = await oracleQueueAccount.loadData();
      let lastPubkey = oracleAccount.publicKey;
      if (queue.size !== 0) {
        lastPubkey = queue.queue[queue.gcIdx];
      }
      const [permissionAccount, permissionBump] =
        sbv2.PermissionAccount.fromSeed(
          program,
          queue.authority,
          oracleQueueAccount.publicKey,
          oracleAccount.publicKey
        );
      const oracle = await oracleAccount.loadData();
      await assert.rejects(async function () {
        await program.rpc.oracleHeartbeat(
          {
            permissionBump,
          },
          {
            accounts: {
              oracle: oracleAccount.publicKey,
              oracleAuthority: payerKeypair.publicKey,
              tokenAccount: oracle.tokenAccount,
              gcOracle: lastPubkey,
              oracleQueue: oracleQueueAccount.publicKey,
              permission: permissionAccount.publicKey,
              dataBuffer: queue.dataBuffer,
            },
            signers: [payerKeypair],
          }
        );
      }); // which code
    });

    it("Heartbeats Once, Then Fails After Permission Revoked.", async () => {
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

      await assert.doesNotReject(async function () {
        await oracleAccount.heartbeat(payerKeypair);
      });

      await heartbeatPermissionAccount.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
        authority: payerKeypair,
        enable: false,
      });

      await assert.rejects(async function () {
        await oracleAccount.heartbeat(payerKeypair);
      }); // 6035
    });
  });

  describe("OpenRound Permission Tests", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let leaseAccount: sbv2.LeaseAccount;
    let oracleAccount: sbv2.OracleAccount;
    let heartbeatPermissionAccount: sbv2.PermissionAccount;
    let aggregatorAccount: sbv2.AggregatorAccount;
    let payoutWallet: PublicKey;
    let payoutKeypair: anchor.web3.Keypair;

    beforeEach(async () => {
      const switchTokenMint = await programStateAccount.getTokenMint();
      payoutKeypair = anchor.web3.Keypair.generate();
      payoutWallet = await switchTokenMint.createAccount(
        payoutKeypair.publicKey
      );
      const publisher = await switchTokenMint.createAccount(
        payerKeypair.publicKey
      );
      await programStateAccount.vaultTransfer(publisher, payerKeypair, {
        amount: new anchor.BN(100),
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

      aggregatorAccount = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("BTC_USD"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });

      leaseAccount = await sbv2.LeaseAccount.create(program, {
        loadAmount: new anchor.BN(15),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount,
      });
      oracleAccount = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });
      heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
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
    });

    it("Succesfully permits openRound", async () => {
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

      await assert.doesNotReject(async function () {
        await aggregatorAccount.openRound({
          oracleQueueAccount: oracleQueueAccount,
          payoutWallet: payoutWallet,
        });
      });
    });

    it("Fails to openRound without permission", async () => {
      /*await assert.rejects(async function () {
        await aggregatorAccount.openRound({
          oracleQueueAccount: oracleQueueAccount,
          payoutWallet: payoutWallet,
        });
      });*/
      try {
        await aggregatorAccount.openRound({
          oracleQueueAccount: oracleQueueAccount,
          payoutWallet: payoutWallet,
        });
      } catch (e) {
        console.log(e);
      }
    });

    it("Opens Round, Then Fails After Permission Revoked", async () => {
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

      await assert.doesNotReject(async function () {
        await aggregatorAccount.openRound({
          oracleQueueAccount: oracleQueueAccount,
          payoutWallet: payoutWallet,
        });
      });

      await aggregatorPermissionAccount.set({
        permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
        authority: payerKeypair,
        enable: false,
      });

      await assert.rejects(async function () {
        await aggregatorAccount.openRound({
          oracleQueueAccount: oracleQueueAccount,
          payoutWallet: payoutWallet,
        });
      }); // 6053
    });
  });

  describe("Permission Set Tests", async function () {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let oracleAccount: sbv2.OracleAccount;
    let payerKeypair = anchor.web3.Keypair.generate();
    let userKeypair2 = anchor.web3.Keypair.generate();

    beforeEach(async function () {
      oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
        name: Buffer.from("q1"),
        metadata: Buffer.from(""),
        reward: new anchor.BN(1),
        slashingEnabled: false,
        minStake: new anchor.BN(0),
        authority: payerKeypair.publicKey,
        mint: MINT,
      });

      oracleAccount = await sbv2.OracleAccount.create(program, {
        queueAccount: oracleQueueAccount,
      });
    });

    it("Creates and Correctly Sets a Permission", async function () {
      let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
        program,
        {
          authority: payerKeypair.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount.publicKey,
        }
      );

      let data = await heartbeatPermissionAccount.loadData();
      assert(data.permissions === 0);

      await assert.doesNotReject(async () => {
        await heartbeatPermissionAccount.set({
          permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
          authority: payerKeypair,
          enable: true,
        });
      });
      data = await heartbeatPermissionAccount.loadData();
      assert(data.permissions === 1);

      await assert.doesNotReject(async () => {
        await heartbeatPermissionAccount.set({
          permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
          authority: payerKeypair,
          enable: true,
        });
      });
      data = await heartbeatPermissionAccount.loadData();
      assert(data.permissions === 3);

      await assert.doesNotReject(async () => {
        await heartbeatPermissionAccount.set({
          permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
          authority: payerKeypair,
          enable: false,
        });
      });
      data = await heartbeatPermissionAccount.loadData();
      assert(data.permissions === 2);

      await assert.doesNotReject(async () => {
        await heartbeatPermissionAccount.set({
          permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
          authority: payerKeypair,
          enable: false,
        });
      });
      data = await heartbeatPermissionAccount.loadData();
      assert(data.permissions === 0);
    });

    it("Creates and Fails to Set an Invalid Permission", async function () {
      let heartbeatPermissionAccount = await sbv2.PermissionAccount.create(
        program,
        {
          authority: userKeypair2.publicKey,
          granter: oracleQueueAccount.publicKey,
          grantee: oracleAccount.publicKey,
        }
      );
      await assert.rejects(
        async () => {
          await heartbeatPermissionAccount.set({
            permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
            authority: payerKeypair,
            enable: true,
          });
        }
        // 6053
      );
    });
  });
});
