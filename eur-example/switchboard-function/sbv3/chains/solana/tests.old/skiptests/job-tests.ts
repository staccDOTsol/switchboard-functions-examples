import "mocha";
import * as assert from "assert";
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import { OracleJob } from "@switchboard-xyz/switchboard-api";

describe("Job tests", () => {
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const program = anchor.workspace.SwitchboardV2;

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

  // it('Creates an invalid Job', async () => {
  // let buffer = Buffer.from("ABCXYZ123");
  // await sbv2.JobAccount.create(program, {
  // name: Buffer.from("switch"),
  // expiration: new anchor.BN(0),
  // data: buffer
  // }).catch(e => {
  // const sbErr = sbv2.SwitchboardError.fromCode(program, e.code);
  // assert.equal(sbErr.name, 'ProtoDeserializeError');
  // });
  // });
});
