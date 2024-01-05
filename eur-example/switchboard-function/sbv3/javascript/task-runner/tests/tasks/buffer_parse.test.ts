import type { ITaskResult, TaskRunner } from "../../src/index.js";
import { JobContext, TaskResult } from "../../src/index.js";
import { TaskRunnerTestContext } from "../setup.js";

import * as anchor from "@coral-xyz/anchor";
import { Big, BigUtils, OracleJob } from "@switchboard-xyz/common";

describe(`BufferLayoutParse tests`, () => {
  let taskRunner: TaskRunner;

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
  });

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  const doTask = (
    input: string,
    iTask: OracleJob.IBufferLayoutParseTask
  ): ITaskResult => {
    const ctx = new JobContext(
      taskRunner,
      "",
      OracleJob.fromObject({ tasks: [iTask] }),
      undefined,
      input
    );
    return taskRunner.tasks.bufferLayoutParseTask(ctx, iTask);
  };

  afterEach(() => jest.restoreAllMocks());

  it(`BufferLayoutParseTask type runs bufferLayoutParseTask.`, async () => {
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `bufferLayoutParseTask`)
      .mockImplementation(() => new Big(100));

    await taskRunner.tasks.run(
      new JobContext(taskRunner.ctx, "", OracleJob.fromObject({})),
      {
        bufferLayoutParseTask: {
          endian: 0,
          type: OracleJob.BufferLayoutParseTask.BufferParseType.bool,
        },
      }
    );
    expect(taskSpy).toHaveBeenCalledTimes(1);
  });

  it(`BufferLayoutParseTask parses a u128.`, async () => {
    const response = new anchor.BN("125969043842182897410903978753911");
    const responseBig = BigUtils.fromBN(response);

    // LE
    const bufferLE = Buffer.alloc(256, 0);
    Buffer.from(new Uint8Array(response.toArray("le", 16))).copy(bufferLE, 132);
    const resultLE = doTask(JSON.stringify(bufferLE), {
      type: OracleJob.BufferLayoutParseTask.BufferParseType.u128,
      endian: OracleJob.BufferLayoutParseTask.Endian.LITTLE_ENDIAN,
      offset: 132,
    });
    expect(resultLE).toStrictEqual(responseBig);

    // BE
    const bufferBE = Buffer.alloc(256, 0);
    Buffer.from(new Uint8Array(response.toArray("be", 16))).copy(bufferBE, 132);
    const resultBE = doTask(JSON.stringify(bufferBE), {
      type: OracleJob.BufferLayoutParseTask.BufferParseType.u128,
      endian: OracleJob.BufferLayoutParseTask.Endian.BIG_ENDIAN,
      offset: 132,
    });
    expect(resultBE).toStrictEqual(responseBig);
  });

  it(`BufferLayoutParseTask parses a u64.`, async () => {
    const response = new anchor.BN("1234567891011");
    const responseBig = BigUtils.fromBN(response);

    // LE
    const bufferLE = Buffer.alloc(32, 0);
    Buffer.from(new Uint8Array(response.toArray("le", 8))).copy(bufferLE, 8);
    const resultLE = doTask(JSON.stringify(bufferLE), {
      type: OracleJob.BufferLayoutParseTask.BufferParseType.u64,
      endian: OracleJob.BufferLayoutParseTask.Endian.LITTLE_ENDIAN,
      offset: 8,
    });
    expect(resultLE).toStrictEqual(responseBig);

    // BE
    const bufferBE = Buffer.alloc(32, 0);
    Buffer.from(new Uint8Array(response.toArray("be", 8))).copy(bufferBE, 8);
    const resultBE = doTask(JSON.stringify(bufferBE), {
      type: OracleJob.BufferLayoutParseTask.BufferParseType.u64,
      endian: OracleJob.BufferLayoutParseTask.Endian.BIG_ENDIAN,
      offset: 8,
    });
    expect(resultBE).toStrictEqual(responseBig);
  });

  it(`BufferLayoutParseTask parses a f64.`, async () => {
    const response = 13371337.1337;

    // LE
    const floatBufferLE = new ArrayBuffer(8);
    const f64LE = new Float64Array(floatBufferLE);
    const u8LE = new Uint8Array(floatBufferLE);
    const dataViewLE = new DataView(floatBufferLE);
    dataViewLE.setFloat64(0, response, true /** Little Endian */);
    const bufferLE = Buffer.alloc(1054, 0);
    Buffer.from([...u8LE]).copy(bufferLE, 266);
    const resultLE = doTask(JSON.stringify(bufferLE), {
      type: OracleJob.BufferLayoutParseTask.BufferParseType.f64,
      endian: OracleJob.BufferLayoutParseTask.Endian.LITTLE_ENDIAN,
      offset: 266,
    });
    expect(resultLE).toStrictEqual(new Big(response));

    // BE
    const floatBufferBE = new ArrayBuffer(8);
    const f64BE = new Float64Array(floatBufferBE);
    const u8BE = new Uint8Array(floatBufferBE);
    const dataViewBE = new DataView(floatBufferBE);
    dataViewBE.setFloat64(0, response, false /** Big Endian */);
    const bufferBE = Buffer.alloc(1054, 0);
    Buffer.from([...u8BE]).copy(bufferBE, 266);
    const resultBE = doTask(JSON.stringify(bufferBE), {
      type: OracleJob.BufferLayoutParseTask.BufferParseType.f64,
      endian: OracleJob.BufferLayoutParseTask.Endian.BIG_ENDIAN,
      offset: 266,
    });
    expect(resultBE).toStrictEqual(new Big(response));
  });

  it(`BufferLayoutParseTask parses a pubkey.`, async () => {
    const keypair = anchor.web3.Keypair.generate();
    const pubkey = keypair.publicKey;

    const buffer = Buffer.alloc(1024, 0);
    pubkey.toBuffer().copy(buffer, 444);

    const result = doTask(JSON.stringify(buffer), {
      offset: 444,
      endian: OracleJob.BufferLayoutParseTask.Endian.LITTLE_ENDIAN,
      type: OracleJob.BufferLayoutParseTask.BufferParseType.pubkey,
    });
    expect(new TaskResult(result).toString()).toStrictEqual(pubkey.toBase58());
  });
});
