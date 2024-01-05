import "mocha";
import * as assert from "assert";
import * as crypto from "crypto";
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import * as spl from "@solana/spl-token";
import {
  JobAccount,
  OracleJob,
  signTransactions,
} from "@switchboard-xyz/switchboard-v2";
// import { OracleJob } from "@switchboard-xyz/switchboard-api";
import fs from "fs";
import {
  ProgramStateAccount,
  programWallet,
} from "@switchboard-xyz/switchboard-v2";
import { PublicKey, Transaction } from "@solana/web3.js";
import { SwitchboardV2 } from "../../target/types/switchboard_v2";

const CHUNK_SIZE: number = 800;

// JobInit TransactionSize: 1195 (800) = 395 bytes without data vec
// JobSetData TransactionSize: 975 (754) = 221 bytes without data vec

export const sleep = (ms: number): Promise<any> =>
  new Promise((s) => setTimeout(s, ms));

describe("Job tests", () => {
  const provider = anchor.AnchorProvider.env();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.

  const program = anchor.workspace
    .SwitchboardV2 as anchor.Program<SwitchboardV2>;

  const payerKeypair = programWallet(program);

  let stateAccount: ProgramStateAccount;
  let stateBump: number;

  let payerAssociatedAccount: anchor.web3.PublicKey;

  before(async () => {
    [stateAccount, stateBump] = ProgramStateAccount.fromSeed(program);
    const mintKeypair = anchor.web3.Keypair.generate();
    const tokenVault = anchor.web3.Keypair.generate();

    payerAssociatedAccount = await spl.Token.getAssociatedTokenAddress(
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      spl.TOKEN_PROGRAM_ID,
      mintKeypair.publicKey,
      payerKeypair.publicKey
    );

    await program.methods
      .programInit({
        stateBump,
      })
      .accounts({
        state: stateAccount.publicKey,
        authority: payerKeypair.publicKey,
        tokenMint: mintKeypair.publicKey,
        vault: tokenVault.publicKey,
        payer: payerKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        daoMint: mintKeypair.publicKey,
      })
      .signers([mintKeypair, tokenVault])
      .preInstructions([
        // create mint
        anchor.web3.SystemProgram.createAccount({
          fromPubkey: payerKeypair.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: spl.MintLayout.span,
          lamports:
            await program.provider.connection.getMinimumBalanceForRentExemption(
              spl.MintLayout.span
            ),
          programId: spl.TOKEN_PROGRAM_ID,
        }),
        spl.Token.createInitMintInstruction(
          spl.TOKEN_PROGRAM_ID,
          mintKeypair.publicKey,
          9,
          payerKeypair.publicKey,
          payerKeypair.publicKey
        ),
        // create token vault
        anchor.web3.SystemProgram.createAccount({
          fromPubkey: payerKeypair.publicKey,
          newAccountPubkey: tokenVault.publicKey,
          space: spl.AccountLayout.span,
          lamports:
            await program.provider.connection.getMinimumBalanceForRentExemption(
              spl.AccountLayout.span
            ),
          programId: spl.TOKEN_PROGRAM_ID,
        }),
        spl.Token.createInitAccountInstruction(
          spl.TOKEN_PROGRAM_ID,
          mintKeypair.publicKey,
          tokenVault.publicKey,
          payerKeypair.publicKey
        ),
        // create payer token account
        spl.Token.createAssociatedTokenAccountInstruction(
          spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          spl.TOKEN_PROGRAM_ID,
          mintKeypair.publicKey,
          payerAssociatedAccount,
          payerKeypair.publicKey,
          payerKeypair.publicKey
        ),
        // mint to payer token account
        spl.Token.createMintToInstruction(
          spl.TOKEN_PROGRAM_ID,
          mintKeypair.publicKey,
          payerAssociatedAccount,
          payerKeypair.publicKey,
          [],
          100_000_000_000_000
        ),
      ])
      .rpc();
  });

  it("Deserializes an existing job", async () => {
    const jobAccount = new JobAccount({
      program,
      publicKey: new PublicKey("6jXKur6RaBMewKyEE8YVGLwWXM15ZDygeoqgAZUW9y3r"),
    });

    const job = await jobAccount.loadData();
    console.log(
      JSON.stringify({ ...job, data: undefined, dataLen: job.data.byteLength })
    );

    assert.ok(job.isInitializing === 0);
  });

  it("Creates a big job", async () => {
    const jobKeypair = anchor.web3.Keypair.generate();

    const oracleJob = OracleJob.create(
      JSON.parse(fs.readFileSync("./tests/big-job.json", "utf8"))
    );
    let data = Buffer.from(OracleJob.encodeDelimited(oracleJob).finish());

    console.log(`DATA LEN: ${data.byteLength}`);
    const state = await stateAccount.loadData();

    // const dataChunks = data.
    const chunks: Buffer[] = [];
    for (let i = 0; i < data.byteLength; ) {
      const end =
        i + CHUNK_SIZE >= data.byteLength ? data.byteLength : i + CHUNK_SIZE;
      // console.log(`[ ${i}, ${end} ]`);
      chunks.push(data.slice(i, end));
      i = end;
    }

    const txns: string[] = [];

    txns.push(
      await program.methods
        .jobInit({
          name: [],
          expiration: new anchor.BN(0),
          data: Buffer.from(""),
          stateBump,
          size: data.byteLength,
        })
        .accounts({
          job: jobKeypair.publicKey,
          authority: payerKeypair.publicKey,
          programState: stateAccount.publicKey,
          payer: payerKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([jobKeypair])
        .rpc()
    );

    for await (const [n, chunk] of chunks.entries()) {
      try {
        txns.push(
          await program.methods
            .jobSetData({
              data: chunk,
              size: data.byteLength,
              chunkIdx: n,
            })
            .accounts({
              job: jobKeypair.publicKey,
              authority: payerKeypair.publicKey,
            })
            .rpc()
        );
      } catch (error) {
        if (error instanceof anchor.AnchorError) {
          console.error(error);
          console.error(error.logs);
        } else {
          console.error(error);
        }
        throw error;
      }
    }

    const jobAccount = new JobAccount({
      program,
      publicKey: jobKeypair.publicKey,
    });
    const job = await jobAccount.loadData();
    console.log(
      JSON.stringify({
        publicKey: jobAccount.publicKey.toString(),
        ...job,
        data: undefined,
        dataLen: job.data.byteLength,
      })
    );

    // await sleep(2000);
    // await printLogs(program.provider.connection, txns);

    assert.ok(job.isInitializing === 0);

    assert.ok(Buffer.compare(data, job.data) === 0);

    const hash = crypto.createHash("sha256");
    hash.update(data);
    assert.ok(
      Buffer.compare(
        Buffer.from(hash.digest("hex"), "hex"),
        Buffer.from(job.hash)
      ) === 0
    );
  });

  it("Creates a small job", async () => {
    const jobKeypair = anchor.web3.Keypair.generate();

    const oracleJob = OracleJob.create({
      tasks: [
        {
          websocketTask: {
            url: "wss://ftx.com/ws/",
            subscription:
              '{"op":"subscribe","channel":"ticker","market":"BTC/USD"}',
            maxDataAgeSeconds: 15,
            filter:
              "$[?(@.type == 'update' && @.channel == 'ticker' && @.market == 'BTC/USD')]",
          },
        },
        {
          medianTask: {
            tasks: [
              {
                jsonParseTask: {
                  path: "$.data.bid",
                },
              },
              {
                jsonParseTask: {
                  path: "$.data.ask",
                },
              },
              {
                jsonParseTask: {
                  path: "$.data.last",
                },
              },
            ],
          },
        },
      ],
    });
    let data = Buffer.from(OracleJob.encodeDelimited(oracleJob).finish());

    console.log(`dataLen: ${data.byteLength}`);

    const state = await stateAccount.loadData();

    const txns: string[] = [];
    try {
      const txn = await program.methods
        .jobInit({
          name: [],
          expiration: new anchor.BN(0),
          data: data,
          stateBump,
          size: null,
        })
        .accounts({
          job: jobKeypair.publicKey,
          authority: payerKeypair.publicKey,
          programState: stateAccount.publicKey,
          payer: payerKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([jobKeypair])
        // .preInstructions([])
        .rpc();
      txns.push(txn);
    } catch (error) {
      if (error instanceof anchor.AnchorError) {
        console.error(error);
        console.error(error.logs);
      } else {
        console.error(error);
      }
      throw error;
    }

    const jobAccount = new JobAccount({
      program,
      publicKey: jobKeypair.publicKey,
    });
    const job = await jobAccount.loadData();
    console.log(
      JSON.stringify({
        publicKey: jobAccount.publicKey.toString(),
        ...job,
        data: undefined,
        dataLen: job.data.byteLength,
      })
    );

    assert.ok(job.isInitializing === 0);

    assert.ok(Buffer.compare(data, job.data) === 0);

    const hash = crypto.createHash("sha256");
    hash.update(data);
    assert.ok(
      Buffer.compare(
        Buffer.from(hash.digest("hex"), "hex"),
        Buffer.from(job.hash)
      ) === 0
    );
  });

  it("Creates a medium job", async () => {
    const jobKeypair = anchor.web3.Keypair.generate();

    const oracleJob = OracleJob.create({
      tasks: [
        {
          meanTask: {
            jobs: [
              {
                tasks: [
                  {
                    websocketTask: {
                      url: "wss://ftx.com/ws/",
                      subscription:
                        '{"op":"subscribe","channel":"ticker","market":"BTC/USD"}',
                      maxDataAgeSeconds: 15,
                      filter:
                        "$[?(@.type == 'update' && @.channel == 'ticker' && @.market == 'BTC/USD')]",
                    },
                  },
                  {
                    medianTask: {
                      tasks: [
                        {
                          jsonParseTask: {
                            path: "$.data.bid",
                          },
                        },
                        {
                          jsonParseTask: {
                            path: "$.data.ask",
                          },
                        },
                        {
                          jsonParseTask: {
                            path: "$.data.last",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
              {
                tasks: [
                  {
                    websocketTask: {
                      url: "wss://ftx.com/ws/",
                      subscription:
                        '{"op":"subscribe","channel":"ticker","market":"BTC/USD"}',
                      maxDataAgeSeconds: 15,
                      filter:
                        "$[?(@.type == 'update' && @.channel == 'ticker' && @.market == 'BTC/USD')]",
                    },
                  },
                  {
                    medianTask: {
                      tasks: [
                        {
                          jsonParseTask: {
                            path: "$.data.bid",
                          },
                        },
                        {
                          jsonParseTask: {
                            path: "$.data.ask",
                          },
                        },
                        {
                          jsonParseTask: {
                            path: "$.data.last",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
              {
                tasks: [
                  {
                    websocketTask: {
                      url: "wss://ftx.com/ws/",
                      subscription:
                        '{"op":"subscribe","channel":"ticker","market":"BTC/USD"}',
                      maxDataAgeSeconds: 15,
                      filter:
                        "$[?(@.type == 'update' && @.channel == 'ticker' && @.market == 'BTC/USD')]",
                    },
                  },
                  {
                    medianTask: {
                      tasks: [
                        {
                          jsonParseTask: {
                            path: "$.data.bid",
                          },
                        },
                        {
                          jsonParseTask: {
                            path: "$.data.ask",
                          },
                        },
                        {
                          jsonParseTask: {
                            path: "$.data.last",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    let data = Buffer.from(OracleJob.encodeDelimited(oracleJob).finish());

    console.log(`dataLen: ${data.byteLength}`);

    const state = await stateAccount.loadData();

    const txns: string[] = [];
    try {
      const txn = await program.methods
        .jobInit({
          name: [],
          expiration: new anchor.BN(0),
          data: data,
          stateBump,
          size: null,
        })
        .accounts({
          job: jobKeypair.publicKey,
          authority: payerKeypair.publicKey,
          programState: stateAccount.publicKey,
          payer: payerKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([jobKeypair])
        // .preInstructions([])
        .rpc();
      txns.push(txn);
    } catch (error) {
      if (error instanceof anchor.AnchorError) {
        console.error(error);
        console.error(error.logs);
      } else {
        console.error(error);
      }
      throw error;
    }

    const jobAccount = new JobAccount({
      program,
      publicKey: jobKeypair.publicKey,
    });
    const job = await jobAccount.loadData();
    console.log(
      JSON.stringify({
        publicKey: jobAccount.publicKey.toString(),
        ...job,
        data: undefined,
        dataLen: job.data.byteLength,
      })
    );

    assert.ok(job.isInitializing === 0);

    assert.ok(Buffer.compare(data, job.data) === 0);

    const hash = crypto.createHash("sha256");
    hash.update(data);
    assert.ok(
      Buffer.compare(
        Buffer.from(hash.digest("hex"), "hex"),
        Buffer.from(job.hash)
      ) === 0
    );
  });
});

export async function printLogs(
  connection: anchor.web3.Connection,
  signatures: string[]
): Promise<void> {
  const parsedLogs = await connection.getParsedTransactions(
    signatures,
    "confirmed"
  );
  const logs = parsedLogs.map((s) => s.meta.logMessages);
  console.log(JSON.stringify(logs, undefined, 2));
}
