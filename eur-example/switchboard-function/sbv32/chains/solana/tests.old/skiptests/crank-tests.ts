import "mocha";
var assert = require("assert");
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import { OracleJob } from "@switchboard-xyz/switchboard-api";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as spl from "@solana/spl-token";

async function leaseCreate(
  program: anchor.Program,
  params: sbv2.LeaseInitParams
): Promise<sbv2.LeaseAccount> {
  const payerKeypair = sbv2.programWallet(program);
  const [programStateAccount, stateBump] =
    sbv2.ProgramStateAccount.fromSeed(program);
  const switchTokenMint = await params.oracleQueueAccount.loadMint();
  const [leaseAccount, leaseBump] = sbv2.LeaseAccount.fromSeed(
    program,
    params.oracleQueueAccount,
    params.aggregatorAccount
  );
  const escrow = await spl.Token.getAssociatedTokenAddress(
    spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    spl.TOKEN_PROGRAM_ID,
    switchTokenMint.publicKey,
    leaseAccount.publicKey,
    true
  );
  await (switchTokenMint as any).createAssociatedTokenAccountInternal(
    leaseAccount.publicKey,
    escrow
  );
  const tx = program.transaction.leaseInit(
    {
      loadAmount: params.loadAmount,
      stateBump,
      leaseBump,
      withdrawAuthority: params.withdrawAuthority ?? PublicKey.default,
      walletBumps: new Buffer([]),
    },
    {
      accounts: {
        programState: programStateAccount.publicKey,
        lease: leaseAccount.publicKey,
        queue: params.oracleQueueAccount.publicKey,
        aggregator: params.aggregatorAccount.publicKey,
        systemProgram: SystemProgram.programId,
        funder: params.funder,
        payer: sbv2.programWallet(program).publicKey,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        escrow,
        owner: params.funderAuthority.publicKey,
        mint: switchTokenMint.publicKey,
      },
      signers: [params.funderAuthority],
    }
  );
  await sendAndConfirmTransaction(
    program.provider.connection,
    tx,
    [payerKeypair],
    { skipPreflight: true }
  );
  return new sbv2.LeaseAccount({ program, publicKey: leaseAccount.publicKey });
}

function pqParent(i: number) {
  if (i > 0) {
    return Math.floor((i - 1) / 2);
  } else {
    return 0;
  }
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

describe("Crank Flow Tests", async () => {
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const program = anchor.workspace.SwitchboardV2;

  const payerKeypair = Keypair.fromSecretKey(
    (program.provider.wallet as any).payer.secretKey
  );
  const [programStateAccount, sbump] =
    await sbv2.ProgramStateAccount.getOrCreate(program, {});
  let switchTokenMint = await programStateAccount.getTokenMint();
  let MINT = switchTokenMint.publicKey;

  it("Creates a Crank", async () => {
    const oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
      name: Buffer.from("q1"),
      metadata: Buffer.from(""),
      slashingEnabled: false,
      reward: new anchor.BN(0),
      minStake: new anchor.BN(0),
      authority: payerKeypair.publicKey,
      mint: MINT,
    });
    const switchTokenMint = await programStateAccount.getTokenMint();
    const publisher = await switchTokenMint.createAccount(
      program.provider.wallet.publicKey
    );
    await programStateAccount.vaultTransfer(publisher, payerKeypair, {
      amount: new anchor.BN(1000),
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

    const crankAccount = await sbv2.CrankAccount.create(program, {
      name: Buffer.from("ABC"),
      metadata: Buffer.from("123"),
      queueAccount: oracleQueueAccount,
    });

    let crank = await crankAccount.loadData();
    console.log(crank);
    assert.equal(crank.pqSize, 0);

    const ag1 = await sbv2.AggregatorAccount.create(program, {
      queueAccount: oracleQueueAccount,
      name: Buffer.from("BTC_USD"),
      batchSize: 1,
      minRequiredOracleResults: 1,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 5,
    });
    const l1 = await leaseCreate(program, {
      loadAmount: new anchor.BN(1),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount,
      aggregatorAccount: ag1,
    });
    const ag2 = await sbv2.AggregatorAccount.create(program, {
      queueAccount: oracleQueueAccount,
      name: Buffer.from("WeatherData"),
      batchSize: 1,
      minRequiredOracleResults: 1,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 5,
    });
    const l2 = await leaseCreate(program, {
      loadAmount: new anchor.BN(1),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount,
      aggregatorAccount: ag2,
    });
    const ag3 = await sbv2.AggregatorAccount.create(program, {
      queueAccount: oracleQueueAccount,
      name: Buffer.from("YankeesScore"),
      batchSize: 1,
      minRequiredOracleResults: 1,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 35,
    });
    const l3 = await leaseCreate(program, {
      loadAmount: new anchor.BN(1),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount,
      aggregatorAccount: ag3,
    });
    const ag4 = await sbv2.AggregatorAccount.create(program, {
      queueAccount: oracleQueueAccount,
      name: Buffer.from("DAI_USD"),
      batchSize: 1,
      minRequiredOracleResults: 1,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 5,
    });
    const l4 = await leaseCreate(program, {
      loadAmount: new anchor.BN(10),
      funder: publisher,
      funderAuthority: payerKeypair,
      oracleQueueAccount,
      aggregatorAccount: ag4,
    });

    await setupPermissions(oracleQueueAccount, ag1, payerKeypair);
    await setupPermissions(oracleQueueAccount, ag2, payerKeypair);
    await setupPermissions(oracleQueueAccount, ag3, payerKeypair);
    await setupPermissions(oracleQueueAccount, ag4, payerKeypair);
    await crankAccount.push({ aggregatorAccount: ag1 }); //10
    await crankAccount.push({ aggregatorAccount: ag2 }); //27
    await crankAccount.push({ aggregatorAccount: ag3 }); //35
    await crankAccount.push({ aggregatorAccount: ag4 }); //1

    crank = await crankAccount.loadData();

    // A simple way to validate the priority queue is to start at the end
    // and assert that each item is >= its parent.

    for (var i = 3; i > 0; i--) {
      assert(
        crank.pqData[i].nextTimestamp >= crank.pqData[pqParent(i)].nextTimestamp
      );
    }
    crank = await crankAccount.loadData();
    let old_size = crank.pqSize;
    const payoutWallet = await switchTokenMint.createAccount(
      program.provider.wallet.publicKey
    );
    const queue = await oracleQueueAccount.loadData();

    await sleep(4000);
    const now = Math.floor(+new Date() / 1000);
    // console.log(`NOW ${now}`);
    // for (let i = 0; i < crank.pqData.length; ++i) {
    // const row = crank.pqData[i];
    // console.log(
    // `-row: ${row.pubkey.toBase58()} - ${row.nextTimestamp.toNumber()}`
    // );
    // }
    await crankAccount.pop({
      queuePubkey: oracleQueueAccount.publicKey,
      queueAuthority: queue.authority,
      payoutWallet,
      queue,
      crank,
      tokenMint: MINT,
    });
    // re-load the crank because we have changed it.
    crank = await crankAccount.loadData();
    let new_size = crank.pqSize;

    // validate that a row has been repushed
    assert(new_size == old_size);

    // validate that the invariant of the min heap is intact.
    for (var i = crank.pqSize - 1; i > 0; i--) {
      assert(
        crank.pqData[i].nextTimestamp >= crank.pqData[pqParent(i)].nextTimestamp
      );
    }
    let peaked = await crankAccount.peakNext(5);
    crank = await crankAccount.loadData();
    let allRows = crank.pqData.slice(0, crank.pqSize);

    // Validate that it gets ready-to-pop items by making lists of ready and not-ready items
    // then verifying the function only returns items present in the "ready" list.

    assert(peaked.length === 4);

    allRows = allRows.map((row: sbv2.CrankRow) => {
      return row.pubkey.toString();
    });
    peaked.forEach((pubkey: PublicKey) => {
      assert(allRows.includes(pubkey.toString()));
      // assert(!notReadyToPop.includes(pubkey.toString()));
    });
  });
});

describe("Crank General Tests", async () => {
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const program = anchor.workspace.SwitchboardV2;

  const payerKeypair = Keypair.fromSecretKey(
    (program.provider.wallet as any).payer.secretKey
  );

  let programStateAccount: sbv2.ProgramStateAccount;
  let sbump: number;
  let switchTokenMint: spl.Token;
  let MINT: PublicKey;

  before(async () => {
    try {
      programStateAccount = await sbv2.ProgramStateAccount.create(program, {});
    } catch (e) {}
    [programStateAccount, sbump] = await sbv2.ProgramStateAccount.fromSeed(
      program
    );
    switchTokenMint = await programStateAccount.getTokenMint();
    MINT = switchTokenMint.publicKey;
  });

  describe("Initialization Tests", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    beforeEach(async () => {
      oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
        name: Buffer.from("q1"),
        metadata: Buffer.from(""),
        slashingEnabled: false,
        reward: new anchor.BN(0),
        minStake: new anchor.BN(0),
        authority: payerKeypair.publicKey,
        mint: MINT,
      });
    });

    it("Fails to Re-Initialize an Already-Initialized Crank", async () => {
      let firstCrankAccount: sbv2.CrankAccount;
      await assert.doesNotReject(async () => {
        firstCrankAccount = await sbv2.CrankAccount.create(program, {
          name: Buffer.from("ABC"),
          metadata: Buffer.from("123"),
          queueAccount: oracleQueueAccount,
        });
      });

      await assert.rejects(async () => {
        await program.rpc.crankInit(
          {
            name: Buffer.from("ABC").slice(0, 32),
            metadata: Buffer.from("123").slice(0, 64),
          },
          {
            accounts: {
              crank: firstCrankAccount.publicKey,
              queue: oracleQueueAccount.publicKey,
            },
            signers: [firstCrankAccount],
            instructions: [],
          }
        );
      });
    });

    it("Fails to Initialize a Crank for an Invalid OracleQueue", async () => {
      let invalidOracleQueueAccount = anchor.web3.Keypair.generate();
      let newCrankKeys = anchor.web3.Keypair.generate();

      await assert.rejects(async () => {
        await program.rpc.crankInit(
          {
            name: Buffer.from("NoRealQ").slice(0, 32),
            metadata: Buffer.from("want2fail").slice(0, 64),
          },
          {
            accounts: {
              crank: newCrankKeys.publicKey,
              queue: invalidOracleQueueAccount.publicKey,
            },
            signers: [newCrankKeys],
            instructions: [
              anchor.web3.SystemProgram.createAccount({
                fromPubkey: program.provider.wallet.publicKey,
                newAccountPubkey: newCrankKeys.publicKey,
                space: program.account.crankAccountData.size,
                lamports:
                  await program.provider.connection.getMinimumBalanceForRentExemption(
                    program.account.crankAccountData.size
                  ),
                programId: program.programId,
              }),
            ],
          }
        );
      });
    });

    it("Initializes a Crank", async () => {
      await assert.doesNotReject(async () => {
        let crankAccount = await sbv2.CrankAccount.create(program, {
          name: Buffer.from("ABC"),
          metadata: Buffer.from("123"),
          queueAccount: oracleQueueAccount,
        });
      });
    });
  });

  describe("Crank Push Tests", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let crankAccount: sbv2.CrankAccount;
    let publisher: PublicKey;
    before(async () => {
      oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
        name: Buffer.from("q1"),
        metadata: Buffer.from(""),
        slashingEnabled: false,
        reward: new anchor.BN(1000000000),
        minStake: new anchor.BN(0),
        authority: payerKeypair.publicKey,
        mint: MINT,
      });

      publisher = await switchTokenMint.createAccount(
        program.provider.wallet.publicKey
      );
      await programStateAccount.vaultTransfer(publisher, payerKeypair, {
        amount: new anchor.BN(1000),
      });
    });

    beforeEach(async () => {
      crankAccount = await sbv2.CrankAccount.create(program, {
        name: Buffer.from("ABC"),
        metadata: Buffer.from("123"),
        queueAccount: oracleQueueAccount,
        maxRows: 3,
      });
    });

    it("Fails to Push without Authority Matching OQueue Authority", async () => {
      let fakeAuthority = anchor.web3.Keypair.generate();

      let agg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("BTC_USD"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });
      let lease = await leaseCreate(program, {
        loadAmount: new anchor.BN(1),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: agg,
      });

      let leaseData = await lease.loadData();
      let escrowAccount = leaseData.escrow;

      await setupPermissions(oracleQueueAccount, agg, payerKeypair);

      const [permissionAccount, permissionBump] =
        await sbv2.PermissionAccount.fromSeed(
          program,
          payerKeypair.publicKey,
          oracleQueueAccount.publicKey,
          agg.publicKey
        );

      const crank = await crankAccount.loadData();
      await assert.rejects(async () => {
        await program.rpc.crankPush(
          {
            sbump,
            permissionBump,
          },
          {
            accounts: {
              crank: crankAccount.publicKey,
              aggregator: agg.publicKey,
              oracleQueue: oracleQueueAccount.publicKey,
              queueAuthority: fakeAuthority.publicKey,
              permission: permissionAccount.publicKey,
              lease: lease.publicKey,
              escrow: escrowAccount,
              programState: programStateAccount.publicKey,
              dataBuffer: crank.dataBuffer,
            },
          }
        );
      });
    });

    it.skip("Passes a Permission PDA with invalid seeds", async () => {});

    it("Fails to Push Without Matching Queue/Aggregator in Lease", async () => {
      let agg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("BTC_USD"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });

      let agg2 = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("WrongOne"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });

      let lease = await leaseCreate(program, {
        loadAmount: new anchor.BN(1),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: agg2,
      });

      await setupPermissions(oracleQueueAccount, agg, payerKeypair);

      const [permissionAccount, permissionBump] =
        await sbv2.PermissionAccount.fromSeed(
          program,
          payerKeypair.publicKey,
          oracleQueueAccount.publicKey,
          agg.publicKey
        );

      let leaseData = await lease.loadData();
      let escrowAccount = leaseData.escrow;

      const crank = await crankAccount.loadData();
      await assert.rejects(async () => {
        await program.rpc.crankPush(
          {
            sbump,
            permissionBump,
          },
          {
            accounts: {
              crank: crankAccount.publicKey,
              aggregator: agg.publicKey,
              oracleQueue: oracleQueueAccount.publicKey,
              queueAuthority: payerKeypair.publicKey,
              permission: permissionAccount.publicKey,
              lease: lease.publicKey,
              escrow: escrowAccount,
              programState: programStateAccount.publicKey,
              dataBuffer: crank.dataBuffer,
            },
          }
        );
      });
    });

    it("Fails to Push Without Supplied Escrow Matching Lease Escrow", async () => {
      let agg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("BTC_USD"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });

      let lease = await leaseCreate(program, {
        loadAmount: new anchor.BN(1),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: agg,
      });

      await setupPermissions(oracleQueueAccount, agg, payerKeypair);

      const [permissionAccount, permissionBump] =
        await sbv2.PermissionAccount.fromSeed(
          program,
          payerKeypair.publicKey,
          oracleQueueAccount.publicKey,
          agg.publicKey
        );

      let leaseData = await lease.loadData();
      let randomEscrowKeypair = anchor.web3.Keypair.generate();
      let randomEscrow = await switchTokenMint.createAccount(
        randomEscrowKeypair.publicKey
      );

      const crank = await crankAccount.loadData();
      await assert.rejects(async () => {
        await program.rpc.crankPush(
          {
            sbump,
            permissionBump,
          },
          {
            accounts: {
              crank: crankAccount.publicKey,
              aggregator: agg.publicKey,
              oracleQueue: oracleQueueAccount.publicKey,
              queueAuthority: payerKeypair.publicKey,
              permission: permissionAccount.publicKey,
              lease: lease.publicKey,
              escrow: randomEscrow,
              programState: programStateAccount.publicKey,
              dataBuffer: crank.dataBuffer,
            },
          }
        );
      });
    });

    it.skip("Fails to Push With Invalid Escrow Account", async () => {
      // This is hard to test... lots of errors thrown all across the callstack
      // when we try to do this...
      let agg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("BTC_USD"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });

      await setupPermissions(oracleQueueAccount, agg, payerKeypair);

      const [permissionAccount, permissionBump] =
        await sbv2.PermissionAccount.fromSeed(
          program,
          payerKeypair.publicKey,
          oracleQueueAccount.publicKey,
          agg.publicKey
        );

      const phonyMintAuthority = anchor.web3.Keypair.generate();
      const decimals = 9;
      const phonyMint = await spl.Token.createMint(
        program.provider.connection,
        payerKeypair,
        phonyMintAuthority.publicKey,
        null,
        decimals,
        spl.TOKEN_PROGRAM_ID
      );
      const phonyTokenVault = await phonyMint.createAccount(
        program.provider.wallet.publicKey
      );
      await phonyMint.mintTo(
        phonyTokenVault,
        phonyMintAuthority.publicKey,
        [phonyMintAuthority],
        100_000_000
      );
      const [leaseAccount, leaseBump] = await sbv2.LeaseAccount.fromSeed(
        program,
        oracleQueueAccount,
        agg
      );
      const phonyEscrow = await phonyMint.createAccount(payerKeypair.publicKey);
      await phonyMint.setAuthority(
        phonyEscrow,
        leaseAccount.publicKey,
        "CloseAccount",
        payerKeypair.publicKey,
        [payerKeypair]
      );
      // Set program to be escrow authority.
      await phonyMint.setAuthority(
        phonyEscrow,
        programStateAccount.publicKey,
        "AccountOwner",
        payerKeypair.publicKey,
        [payerKeypair]
      );
      let randomFunderKeypair = anchor.web3.Keypair.generate();
      let randomFunderAccount = await phonyMint.createAccount(
        randomFunderKeypair.publicKey
      );

      await program.rpc.leaseInit(
        {
          loadAmount: 0,
          sbump,
          leaseBump,
          withdrawAuthority: PublicKey.default,
        },
        {
          accounts: {
            programState: programStateAccount.publicKey,
            lease: leaseAccount.publicKey,
            queue: oracleQueueAccount.publicKey,
            aggregator: agg.publicKey,
            systemProgram: SystemProgram.programId,
            funder: randomFunderAccount,
            payer: program.provider.wallet.publicKey,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            escrow: phonyEscrow,
            owner: payerKeypair.publicKey,
          },
          signers: [payerKeypair],
        }
      );

      //await assert.rejects(async () => {
      try {
        await program.rpc.crankPush(
          {
            sbump,
            permissionBump,
          },
          {
            accounts: {
              crank: crankAccount.publicKey,
              aggregator: agg.publicKey,
              oracleQueue: oracleQueueAccount.publicKey,
              queueAuthority: payerKeypair.publicKey,
              permission: permissionAccount.publicKey,
              lease: leaseAccount.publicKey,
              escrow: phonyEscrow,
              programState: programStateAccount.publicKey,
            },
          }
        );
      } catch (e) {
        console.log(e);
      }
      //}, {code: 141}); /* 141 = "a has_one constraint was violated"*/
    });

    it("Fails to Push with Excessive Crank Rows", async () => {
      let agg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("BTC_USD"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });
      let lease = await leaseCreate(program, {
        loadAmount: new anchor.BN(1),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: agg,
        withdrawAuthority: payerKeypair.publicKey,
      });

      const [leaseAccount, leaseBump] = await sbv2.LeaseAccount.fromSeed(
        program,
        oracleQueueAccount,
        agg
      );

      await setupPermissions(oracleQueueAccount, agg, payerKeypair);

      await crankAccount.push({ aggregatorAccount: agg });

      // Code 6037 = "Aggregator is already pushed on a crank"
      await assert.rejects(async () => {
        await crankAccount.push({ aggregatorAccount: agg });
      });
    });

    it("Doesn't allow you to withdraw more than one round's worth from a lease.", async () => {
      let agg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("BTC_USD"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });
      let lease = await leaseCreate(program, {
        loadAmount: new anchor.BN(1),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: agg,
        withdrawAuthority: payerKeypair.publicKey,
      });

      const [leaseAccount, leaseBump] = await sbv2.LeaseAccount.fromSeed(
        program,
        oracleQueueAccount,
        agg
      );

      let leaseData = await lease.loadData();
      let escrow = leaseData.escrow;
      let currentBalance = await provider.connection.getTokenAccountBalance(
        escrow
      );
      assert(
        leaseData.isActive,
        "before withdrawal, the lease is active, as expected."
      );
      assert.rejects(
        async () => {
          await program.rpc.leaseWithdraw(
            {
              stateBump: sbump,
              leaseBump: leaseBump,
              amount: new anchor.BN(1),
            },
            {
              accounts: {
                lease: leaseAccount.publicKey,
                escrow: escrow,
                aggregator: agg.publicKey,
                queue: oracleQueueAccount.publicKey,
                withdrawAuthority: payerKeypair.publicKey,
                withdrawAccount: publisher,
                leaseAuthority: payerKeypair.publicKey,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
                programState: programStateAccount.publicKey,
              },
              signers: [payerKeypair],
            }
          );
        },
        { code: 355 }
      );
    });

    it("Fails to Push With Invalid OQueue / Aggregator Permission", async () => {
      let agg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("BTC_USD"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });
      let lease = await leaseCreate(program, {
        loadAmount: new anchor.BN(1),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: agg,
        withdrawAuthority: payerKeypair.publicKey,
      });

      const permissionAccount = await sbv2.PermissionAccount.create(program, {
        authority: payerKeypair.publicKey,
        granter: oracleQueueAccount.publicKey,
        grantee: agg.publicKey,
      });

      await assert.rejects(async () => {
        await crankAccount.push({ aggregatorAccount: agg });
      }); //6035 == missing required flags
    });

    it("Fails to Push When Crank Reaches Max Capacity", async () => {
      for (var i = 0; i < 3; i++) {
        let agg_i = await sbv2.AggregatorAccount.create(program, {
          queueAccount: oracleQueueAccount,
          name: Buffer.from("BTC_USD"),
          batchSize: 1,
          minRequiredOracleResults: 1,
          minRequiredJobResults: 1,
          minUpdateDelaySeconds: 5,
        });

        let l_i = await leaseCreate(program, {
          loadAmount: new anchor.BN(1),
          funder: publisher,
          funderAuthority: payerKeypair,
          oracleQueueAccount,
          aggregatorAccount: agg_i,
          withdrawAuthority: payerKeypair.publicKey,
        });

        await setupPermissions(oracleQueueAccount, agg_i, payerKeypair);

        await crankAccount.push({ aggregatorAccount: agg_i });
      }

      await assert.rejects(async () => {
        let failing_agg = await sbv2.AggregatorAccount.create(program, {
          queueAccount: oracleQueueAccount,
          name: Buffer.from("BTC_USD"),
          batchSize: 1,
          minRequiredOracleResults: 1,
          minRequiredJobResults: 1,
          minUpdateDelaySeconds: 5,
        });

        let failingLease = await leaseCreate(program, {
          loadAmount: new anchor.BN(1),
          funder: publisher,
          funderAuthority: payerKeypair,
          oracleQueueAccount,
          aggregatorAccount: failing_agg,
          withdrawAuthority: payerKeypair.publicKey,
        });

        await setupPermissions(oracleQueueAccount, failing_agg, payerKeypair);

        await crankAccount.push({ aggregatorAccount: failing_agg });
      }); // 6022
    });

    it("Correctly Pushes Aggregators to the Crank", async () => {
      let agg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("BTC_USD"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });

      let lease = await leaseCreate(program, {
        loadAmount: new anchor.BN(1),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: agg,
        withdrawAuthority: payerKeypair.publicKey,
      });

      await setupPermissions(oracleQueueAccount, agg, payerKeypair);

      await assert.doesNotReject(async () => {
        await crankAccount.push({ aggregatorAccount: agg });
      });
    });
  });

  describe("Crank Pop Tests", async () => {
    let oracleQueueAccount: sbv2.OracleQueueAccount;
    let crankAccount: sbv2.CrankAccount;
    let publisher: PublicKey;
    let oracleAccount: sbv2.OracleAccount;
    before(async () => {
      oracleQueueAccount = await sbv2.OracleQueueAccount.create(program, {
        name: Buffer.from("q1"),
        metadata: Buffer.from(""),
        slashingEnabled: false,
        reward: new anchor.BN(10),
        minStake: new anchor.BN(0),
        authority: payerKeypair.publicKey,
        mint: MINT,
      });

      publisher = await switchTokenMint.createAccount(
        program.provider.wallet.publicKey
      );
      await programStateAccount.vaultTransfer(publisher, payerKeypair, {
        amount: new anchor.BN(1000),
      });

      oracleAccount = await sbv2.OracleAccount.create(program, {
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
    });

    beforeEach(async () => {
      crankAccount = await sbv2.CrankAccount.create(program, {
        name: Buffer.from("ABC"),
        metadata: Buffer.from("123"),
        queueAccount: oracleQueueAccount,
        maxRows: 3,
      });
    });

    it("Succesfully Opens Round and Repushes a Feed", async () => {
      let firstAgg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("Agg1"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });
      let firstLease = await leaseCreate(program, {
        loadAmount: new anchor.BN(100),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: firstAgg,
        withdrawAuthority: payerKeypair.publicKey,
      });
      await setupPermissions(oracleQueueAccount, firstAgg, payerKeypair);

      let secondAgg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("Agg2"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });
      let secondLease = await leaseCreate(program, {
        loadAmount: new anchor.BN(100),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: secondAgg,
        withdrawAuthority: payerKeypair.publicKey,
      });
      await setupPermissions(oracleQueueAccount, secondAgg, payerKeypair);

      let thirdAgg = await sbv2.AggregatorAccount.create(program, {
        queueAccount: oracleQueueAccount,
        name: Buffer.from("Agg2"),
        batchSize: 1,
        minRequiredOracleResults: 1,
        minRequiredJobResults: 1,
        minUpdateDelaySeconds: 5,
      });
      let thirdLease = await leaseCreate(program, {
        loadAmount: new anchor.BN(100),
        funder: publisher,
        funderAuthority: payerKeypair,
        oracleQueueAccount,
        aggregatorAccount: thirdAgg,
        withdrawAuthority: payerKeypair.publicKey,
      });
      await setupPermissions(oracleQueueAccount, thirdAgg, payerKeypair);

      await assert.doesNotReject(async () => {
        await crankAccount.push({ aggregatorAccount: firstAgg });
        await crankAccount.push({ aggregatorAccount: secondAgg });
        await crankAccount.push({ aggregatorAccount: thirdAgg });
      });

      let myPayoutKeypair = anchor.web3.Keypair.generate();
      let myPayoutWallet = await switchTokenMint.createAccount(
        myPayoutKeypair.publicKey
      );

      let crankData = await crankAccount.loadData();
      let walletBalance = await provider.connection.getTokenAccountBalance(
        myPayoutWallet
      );

      console.log(crankData.pqData.slice(0, 3));
      console.log(walletBalance);
      const queue = await oracleQueueAccount.loadData();
      await sleep(4000);
      // const now = Math.floor(+new Date() / 1000);
      // console.log(`NOW ${now}`);
      // const crank = crankData;
      // for (let i = 0; i < crank.pqData.length; ++i) {
      // const row = crank.pqData[i];
      // console.log(
      // `-row: ${row.pubkey.toBase58()} - ${row.nextTimestamp.toNumber()}`
      // );
      // }
      try {
        await crankAccount.pop({
          queuePubkey: oracleQueueAccount.publicKey,
          queueAuthority: queue.authority,
          payoutWallet: myPayoutWallet,
          queue,
          crank: await crankAccount.loadData(),
          tokenMint: MINT,
        });
      } catch (e) {
        console.log(JSON.stringify(e, null, 2));
      }
      await assert.doesNotReject(async () => {
        await crankAccount.pop({
          queuePubkey: oracleQueueAccount.publicKey,
          queueAuthority: queue.authority,
          payoutWallet: myPayoutWallet,
          queue,
          crank: await crankAccount.loadData(),
          tokenMint: MINT,
        });
      });
      crankData = await crankAccount.loadData();
      walletBalance = await provider.connection.getTokenAccountBalance(
        myPayoutWallet
      );
      console.log(walletBalance);
      console.log(crankData.pqData.slice(0, 3));
    });

    it.skip("Fails to Pop if Supplied Queue Doesn't Match Crank Queue", async () => {});

    it.skip("Fails to Pop if Supplied Authority Doesn't Match Queue Authority", async () => {});

    it.skip("Fails to Pop if Crank is Empty", async () => {});

    describe.skip("Remaining Accounts / Binary Search Logic Tests", async () => {
      it("Fails if the Popped Key isn't found in remaining_accounts", async () => {
        // The aggregator popped from the crank isn't the account passed to the function, nor is it present in "remaining_accounts".
        // Might need a raw RPC call to test this.
      });

      it("Fails if the Permission Can't be Derived", async () => {});

      it("Fails if the Permission Can be Derived, but Is Not Supplied in Remaining Accounts", async () => {});

      it("Fails if the Lease Can't be Derived", async () => {});

      it("Fails if the Lease Can be Derived, but Is Not Supplied in Remaining Accounts", async () => {});

      it("Fails if the Lease Can be Derived, but Is Not Supplied in Remaining Accounts", async () => {});

      it("Fails if Escrow Not Supplied in Remaining Accounts", async () => {});
    });

    describe.skip("Stale Feed Tests", async () => {
      it("Does not repush a Feed If Its Permission was Revoked", async () => {});

      it("Does not Repush a Feed If Its Lease is Depleted", async () => {});

      it("Fails with OpenRound Errors", async () => {});
    });
  });
});
