import "mocha";
import * as assert from "assert";
import * as anchor from "@coral-xyz/anchor";
//import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import * as sbv2 from "../../../switchboardv2-api";
//import * as BN from "bn.js";
import { OracleJob } from "@switchboard-xyz/switchboard-api";
import * as borsh from "borsh";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  Vote,
  YesNoVote,
  VoteKind,
  VoteType,
  VoteTypeKind,
  withCreateRealm,
  MintMaxVoteWeightSource,
  withCreateGovernance,
  GovernanceConfig,
  withDepositGoverningTokens,
  //VoteThreshold,
  //VoteThresholdType,
  VoteThresholdPercentage,
  //VoteWeightSource,
  VoteTipping,
  getTokenOwnerRecordAddress,
  withCreateTokenOwnerRecord,
  getGovernanceProgramVersion,
  InstructionData,
  AccountMetaData,
  withCreateProposal,
  withInsertTransaction,
  createInstructionData,
  withAddSignatory,
  withSignOffProposal,
  getSignatoryRecordAddress,
  withCastVote,
  withExecuteTransaction,
  getVoterWeightRecord,
  withFinalizeVote,
  VoterWeightRecord,
} from "@solana/spl-governance";
import * as spl from "@solana/spl-token";
import base58 = require("bs58");
import { initializeAddin } from "./addin-utils";
const util = require("util");

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("AddIn tests", async function () {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const switchboardProgram = anchor.workspace.SwitchboardV2;
  const addinProgram = anchor.workspace.Gameofnodes;

  const govProgram = new PublicKey(
    "2iNnEMZuLk2TysefLvXtS6kyvCFC7CDUTLLeatVgRend"
  );

  const payerKeypair = Keypair.fromSecretKey(
    (provider.wallet as any).payer.secretKey
  );
  const oracleOwner1 = Keypair.fromSecretKey(
    base58.decode(
      "5Ef97pWJv4B4ByHF4GVLxvJE2s4iTTuu2HhMxN9vmi9s5t53DedBMbih4wZjEbZAtYq57MW5J6uLXXpA1kShsmCg"
    )
  );

  console.log(`ORACLE OWNER 1: ${oracleOwner1.publicKey.toBase58()}`);

  const oracleOwner2 = Keypair.generate();

  let communityMint: spl.Token;

  let payersTokenAccount: PublicKey;

  before(async function () {
    var fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        lamports: 1000000000,
        toPubkey: oracleOwner1.publicKey,
      }),
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        lamports: 1000000000,
        toPubkey: oracleOwner2.publicKey,
      })
    );
    await sendAndConfirmTransaction(provider.connection, fundTx, [
      payerKeypair,
    ]);

    communityMint = await spl.Token.createMint(
      provider.connection,
      payerKeypair,
      payerKeypair.publicKey,
      null,
      9,
      spl.TOKEN_PROGRAM_ID
    );

    let programState = await sbv2.ProgramStateAccount.create(
      switchboardProgram,
      {
        daoMint: communityMint.publicKey,
      }
    );
    console.log(`program state pubeky: ${programState.publicKey.toBase58()}`);

    payersTokenAccount = await communityMint.createAccount(
      payerKeypair.publicKey
    );

    let createRealmInstructions: TransactionInstruction[] = [];
    const createRealmTransaction = new Transaction();
    let realmName = "SwitchboardGovernance";
    let realm = await withCreateRealm(
      createRealmInstructions,
      govProgram,
      2,
      realmName,
      payerKeypair.publicKey,
      communityMint.publicKey,
      payerKeypair.publicKey,
      undefined,
      // what's the deal with this? does it need to change?
      new MintMaxVoteWeightSource({
        value: new anchor.BN(1000),
      }),
      new anchor.BN(0),
      //addinProgram.programId,
      switchboardProgram.programId
    );

    createRealmTransaction.add(...createRealmInstructions);

    await assert.doesNotReject(async function () {
      await sendAndConfirmTransaction(
        provider.connection,
        createRealmTransaction,
        [payerKeypair]
      );
    });

    let realmInfo = await provider.connection.getAccountInfo(realm);
    assert.equal(realmInfo.owner.toBase58(), govProgram);

    let createTokenHolderAccountInstructions: TransactionInstruction[] = [];
    let tokenHolderAddress = await withCreateTokenOwnerRecord(
      createTokenHolderAccountInstructions,
      govProgram,
      realm,
      payerKeypair.publicKey,
      communityMint.publicKey,
      payerKeypair.publicKey
    );
    let createTokenHolderAccountTx = new Transaction();
    createTokenHolderAccountTx.add(...createTokenHolderAccountInstructions);
    await assert.doesNotReject(async function () {
      await sendAndConfirmTransaction(
        provider.connection,
        createTokenHolderAccountTx,
        [payerKeypair]
      );
    });

    let tokenHolderInfo = await provider.connection.getAccountInfo(
      tokenHolderAddress
    );
    assert.equal(tokenHolderInfo.owner.toBase58(), govProgram);

    let [governedAccount, governedAccountSeed] =
      await PublicKey.findProgramAddress(
        [Buffer.from("governed-account")],
        govProgram
      );

    const governanceConfig = new GovernanceConfig({
      voteThresholdPercentage: new VoteThresholdPercentage({ value: 51 }),
      minCommunityTokensToCreateProposal: new anchor.BN(0),
      minInstructionHoldUpTime: 0,
      maxVotingTime: 86400,
      //voteWeightSource: VoteWeightSource.Deposit,
      voteTipping: VoteTipping.Strict,
      //proposalCoolOffTime: 2400,
      minCouncilTokensToCreateProposal: new anchor.BN(0),
    });

    let createGovernanceInstructions: TransactionInstruction[] = [];
    const createGovernanceTransaction = new Transaction();
    let governance = await withCreateGovernance(
      createGovernanceInstructions,
      govProgram,
      2,
      realm,
      governedAccount,
      governanceConfig,
      tokenHolderAddress,
      payerKeypair.publicKey,
      payerKeypair.publicKey
    );
    console.log(realm.toBase58());
    createGovernanceTransaction.add(...createGovernanceInstructions);
    await assert.doesNotReject(async () => {
      await sendAndConfirmTransaction(
        provider.connection,
        createGovernanceTransaction,
        [payerKeypair, payerKeypair]
      );
    });

    let oracleQueueAccount = await sbv2.OracleQueueAccount.create(
      switchboardProgram,
      {
        name: Buffer.from("myQueue"),
        reward: new anchor.BN(0),
        minStake: new anchor.BN(0),
        feedProbationPeriod: 0,
        authority: governance,
        oracleTimeout: new anchor.BN(1),
        slashingEnabled: false,
        varianceToleranceMultiplier: 1,
        consecutiveFeedFailureLimit: new anchor.BN(5),
        consecutiveOracleFailureLimit: new anchor.BN(0),
        minimumDelaySeconds: 5,
        queueSize: 10,
        unpermissionedFeeds: false,
        //mint: spl.NATIVE_MINT,
      }
    );

    console.log(
      `ORALCE QUEUE ACCOUNT: ${oracleQueueAccount.publicKey.toBase58()}`
    );

    let oracleAccount = await sbv2.OracleAccount.create(switchboardProgram, {
      name: Buffer.from("DummyOracle"),
      metadata: Buffer.from(""),
      oracleAuthority: oracleOwner1,
      queueAccount: oracleQueueAccount,
    });

    console.log("oracle account", oracleAccount.publicKey.toBase58());

    let permission = await sbv2.PermissionAccount.create(switchboardProgram, {
      granter: oracleQueueAccount.publicKey,
      grantee: oracleAccount.publicKey,
      authority: governance,
      /*oracleOwner: oracleOwner1.publicKey,*/
    });

    const ix = await permission.setVoterWeightTx({ govProgram: govProgram });
    //const setVoterWeightIx = createInstructionData(ix.instructions[0]);

    let [voterWeightPubkey, vwb1] =
      anchor.utils.publicKey.findProgramAddressSync(
        [Buffer.from("VoterWeightRecord"), oracleAccount.publicKey.toBytes()],
        switchboardProgram.programId
      );

    const [tokenOwnerPubkey] = anchor.utils.publicKey.findProgramAddressSync(
      [
        Buffer.from("governance"),
        realm.toBytes(),
        communityMint.publicKey.toBytes(),
        oracleOwner1.publicKey.toBytes(),
      ],
      govProgram
    );

    // Need to create a transaction with multiple instructions:
    // 1. Set Vote Weight
    // 2. Create Proposal
    let proposalInstructions: TransactionInstruction[] = [];
    proposalInstructions.push(ix.instructions[0]);
    let proposalAddress = await withCreateProposal(
      proposalInstructions,
      govProgram,
      2,
      realm,
      governance,
      tokenOwnerPubkey,
      "Enable Heartbeat Permissions",
      "heylol",
      communityMint.publicKey,
      oracleOwner1.publicKey,
      0,
      VoteType.SINGLE_CHOICE,
      ["Vote on Oracle2's Permission and Acceptance to the DAO."],
      true,
      oracleOwner1.publicKey,
      voterWeightPubkey
    );
    console.log("the create proposal instruction:");
    console.log(proposalInstructions[1].keys);
    let proposalTx = new Transaction();
    proposalTx.add(...proposalInstructions);
    await assert.doesNotReject(async function () {
      await sendAndConfirmTransaction(provider.connection, proposalTx, [
        oracleOwner1,
        payerKeypair,
      ]);
    });
    let vwd = await getVoterWeightRecord(
      provider.connection,
      voterWeightPubkey
    );
    console.log(`weight =  ${vwd.account.voterWeight}`);

    let permissionSetTx = await permission.setTx({
      permission: sbv2.SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT,
      authority: governance as PublicKey,
      enable: true,
    });
    const setIdData = createInstructionData(permissionSetTx.instructions[0]);
    // governance.js doesn't play nicely with remainingAccounts
    console.log(setIdData);

    let insertTxInst: TransactionInstruction[] = [];
    insertTxInst.push(ix.instructions[0]);
    let addInst = await withInsertTransaction(
      insertTxInst,
      govProgram,
      2,
      governance,
      proposalAddress,
      tokenOwnerPubkey,
      oracleOwner1.publicKey,
      0,
      0,
      0,
      [setIdData],
      oracleOwner1.publicKey
    );
    let addInstTx = new Transaction();
    addInstTx.add(...insertTxInst);
    await assert.doesNotReject(async function () {
      await sendAndConfirmTransaction(provider.connection, addInstTx, [
        oracleOwner1,
        payerKeypair,
      ]);
    });
    vwd = await getVoterWeightRecord(provider.connection, voterWeightPubkey);
    console.log(`weight =  ${vwd.account.voterWeight}`);

    let signInst: TransactionInstruction[] = [];
    signInst.push(ix.instructions[0]);
    let signature = await withSignOffProposal(
      signInst,
      govProgram,
      2,
      realm,
      governance,
      proposalAddress,
      oracleOwner1.publicKey,
      //signatoryRecordAddress,
      undefined,
      tokenOwnerPubkey
    );
    let signTx = new Transaction();
    signTx.add(...signInst);
    await assert.doesNotReject(async function () {
      await sendAndConfirmTransaction(provider.connection, signTx, [
        oracleOwner1,
        payerKeypair,
      ]);
    });
    vwd = await getVoterWeightRecord(provider.connection, voterWeightPubkey);
    console.log(`weight =  ${vwd.account.voterWeight}`);

    let voteInst: TransactionInstruction[] = [];
    voteInst.push(ix.instructions[0]);
    let castVote = await withCastVote(
      voteInst,
      govProgram,
      2,
      realm,
      governance,
      proposalAddress,
      tokenOwnerPubkey,
      tokenOwnerPubkey,
      oracleOwner1.publicKey,
      communityMint.publicKey,
      Vote.fromYesNoVote(YesNoVote.Yes),
      oracleOwner1.publicKey,
      voterWeightPubkey
    );
    let castVoteTx = new Transaction();
    castVoteTx.add(...voteInst);
    voteInst.push(ix.instructions[0]);
    await assert.doesNotReject(async function () {
      await sendAndConfirmTransaction(provider.connection, castVoteTx, [
        oracleOwner1,
        payerKeypair,
      ]);
    });
    vwd = await getVoterWeightRecord(provider.connection, voterWeightPubkey);
    console.log(`weight =  ${vwd.account.voterWeight}`);

    console.log("waiting 1 second...");
    await delay(10000);
    console.log("1 second elapsed.");

    let executeInst: TransactionInstruction[] = [];
    executeInst.push(ix.instructions[0]);
    let exec = await withExecuteTransaction(
      executeInst,
      govProgram,
      2,
      governance,
      proposalAddress,
      addInst,
      [setIdData]
    );
    let execTx = new Transaction();
    execTx.add(...executeInst);
    console.log("waiting 1 second...");
    await delay(5000);
    console.log("1 second elapsed.");

    let pData = await permission.loadData();
    console.log(pData);
    await assert.doesNotReject(async function () {
      await sendAndConfirmTransaction(provider.connection, execTx, [
        oracleOwner1,
        payerKeypair,
      ]);
    });
    pData = await permission.loadData();
    console.log(pData);
    vwd = await getVoterWeightRecord(provider.connection, voterWeightPubkey);
    console.log(`weight =  ${vwd.account.voterWeight}`);
  });

  it("Works", async function () {
    assert.equal(1, 1);
  });
});
