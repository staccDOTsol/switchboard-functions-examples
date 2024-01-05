import "mocha";
import * as assert from "assert";
import * as anchor from "@coral-xyz/anchor";
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
  getGovernance,
  serializeInstructionToBase64,
  MintMaxVoteWeightSourceType,
} from "@solana/spl-governance";
import * as spl from "@solana/spl-token";
import base58 = require("bs58");
import { initializeAddin, grantPermissionTx } from "./addin-utils";
import { ProgramStateAccount, QueueAccount } from "@switchboard-xyz/solana.js";
import { setupTest, TestContext } from "../utils";
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

  let switchboard: TestContext;

  const payerKeypair = Keypair.fromSecretKey(
    (provider.wallet as any).payer.secretKey
  );
  const oracleOwner1 = Keypair.fromSecretKey(
    base58.decode(
      "5Ef97pWJv4B4ByHF4GVLxvJE2s4iTTuu2HhMxN9vmi9s5t53DedBMbih4wZjEbZAtYq57MW5J6uLXXpA1kShsmCg"
    )
  );
  const oracleOwner2 = Keypair.fromSecretKey(
    base58.decode(
      "KDtXfjowzKCwaq2MF9JXdQsVGoccK7qiK2WngCvjaHst3S7GGqyan5AVLHT2RbmidJuEgpM1D3WiQDYUxE7dhjY"
    )
  );

  console.log(`ORACLE OWNER 1: ${oracleOwner1.publicKey.toBase58()}`);
  console.log(`ORACLE OWNER 2: ${oracleOwner2.publicKey.toBase58()}`);

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

    switchboard = await setupTest();

    console.log(
      `program state pubeky: ${switchboard.program.programState.publicKey}`
    );

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
        type: MintMaxVoteWeightSourceType.SupplyFraction,
        value: new anchor.BN(1000),
      }),
      new anchor.BN(0),
      addinProgram.programId
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
      2,
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
        [Buffer.from("governed-account1")],
        govProgram
      );

    let [governedAccount2, governedAccountSeed2] =
      await PublicKey.findProgramAddress(
        [Buffer.from("governed-account2")],
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
    let gov = await getGovernance(provider.connection, governance);
    console.log("THIS WORKS HERE");
    console.log(gov);

    const governanceConfig2 = new GovernanceConfig({
      voteThresholdPercentage: new VoteThresholdPercentage({ value: 51 }),
      minCommunityTokensToCreateProposal: new anchor.BN(0),
      minInstructionHoldUpTime: 0,
      maxVotingTime: 86400,
      //voteWeightSource: VoteWeightSource.Deposit,
      voteTipping: VoteTipping.Strict,
      //proposalCoolOffTime: 2400,
      minCouncilTokensToCreateProposal: new anchor.BN(0),
    });

    let createGovernanceInstructions2: TransactionInstruction[] = [];
    const createGovernanceTransaction2 = new Transaction();
    let governance2 = await withCreateGovernance(
      createGovernanceInstructions2,
      govProgram,
      2,
      realm,
      governedAccount2,
      governanceConfig2,
      tokenHolderAddress,
      payerKeypair.publicKey,
      payerKeypair.publicKey
    );
    createGovernanceTransaction2.add(...createGovernanceInstructions2);
    await assert.doesNotReject(async () => {
      await sendAndConfirmTransaction(
        provider.connection,
        createGovernanceTransaction2,
        [payerKeypair, payerKeypair]
      );
    });
    console.log(
      `governance1: ${governance.toBase58()}\ngovernance2: ${governance2.toBase58()}`
    );

    let addinState = await initializeAddin(
      addinProgram,
      governance,
      governance2,
      payerKeypair
    );
    console.log(`addinState pubkey ${addinState.toBase58()}`);

    const [oracleQueueAccount] = await QueueAccount.create(
      switchboard.program,
      {
        name: "myQueue",
        reward: 0,
        minStake: 0,
        feedProbationPeriod: 0,
        authority: addinState,
        oracleTimeout: 1,
        slashingEnabled: false,
        varianceToleranceMultiplier: 1,
        consecutiveFeedFailureLimit: 5,
        consecutiveOracleFailureLimit: 0,
        queueSize: 10,
        unpermissionedFeeds: false,
      }
    );

    let d = await oracleQueueAccount.loadData();
    console.log(d);

    console.log(
      `ORALCE QUEUE ACCOUNT: ${oracleQueueAccount.publicKey.toBase58()}`
    );

    const [oracleAccount] = await oracleQueueAccount.createOracle({
      name: "DummyOracle",
      authority: oracleOwner1,
      enable: true,
    });

    console.log("oracle account", oracleAccount.publicKey.toBase58());

    const [oracleAccount2] = await oracleQueueAccount.createOracle({
      name: "DummyOracle2",
      authority: oracleOwner2,
      enable: true,
    });
    console.log("oracle account 2: ", oracleAccount2.publicKey.toBase58());

    const ix = await permission.setVoterWeightTx({
      govProgram: govProgram,
      addinProgram: addinProgram,
      realm: realm,
      pubkeySigner: undefined,
    });
    //const setVoterWeightIx = createInstructionData(ix.instructions[0]);

    let [voterWeightPubkey, vwb1] =
      anchor.utils.publicKey.findProgramAddressSync(
        [Buffer.from("VoterWeightRecord"), oracleAccount.publicKey.toBytes()],
        addinProgram.programId
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
      await sendAndConfirmTransaction(
        provider.connection,
        proposalTx,
        [oracleOwner1, payerKeypair],
        { skipPreflight: true }
      );
    });
    let vwd = await getVoterWeightRecord(
      provider.connection,
      voterWeightPubkey
    );
    console.log(`weight =  ${vwd.account.voterWeight}`);

    let grantTx = await grantPermissionTx(
      addinProgram,
      governance,
      switchboardProgram.programId,
      permission.publicKey
    );
    let grantIx = grantTx.instructions[0];
    const grantIdData = createInstructionData(grantIx);

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
      [grantIdData],
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
      [grantIdData]
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

    let grantTx2 = await grantPermissionTx(
      addinProgram,
      governance,
      switchboardProgram.programId,
      permission2.publicKey
    );
    let grantIx2 = grantTx2.instructions[0];
    let grantIxd = serializeInstructionToBase64(grantIx2);
    console.log(grantIxd);

    /*const ix2 = await permission2.setVoterWeightTx({ 
      govProgram: govProgram, 
      addinProgram: addinProgram,
      realm: realm,
      pubkeySigner: undefined
    });

    await sendAndConfirmTransaction(provider.connection, ix2, [
      payerKeypair,
    ]);*/

    /*let revoke = await grantPermissionTx(
      addinProgram, 
      governance, 
      switchboardProgram.programId,
      permission2.publicKey
    );
    let grantIx2 = grantTx2.instructions[0];
    let grantIxd = serializeInstructionToBase64(grantIx2);
    console.log(grantIxd);*/
  });

  it("Works", async function () {
    assert.equal(1, 1);
  });
});
