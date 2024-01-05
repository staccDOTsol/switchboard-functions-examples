import type { TaskResult, TaskRunner } from "../../src";
import { JobContext } from "../../src";
import { TaskRunnerTestContext } from "../setup";

import { PublicKey } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";

describe(`CacheTask tests`, () => {
  let taskRunner: TaskRunner;

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
  });

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  const runTask = async (): Promise<{
    threw: boolean;
    result?: TaskResult;
  }> => {
    const cacheTask = new OracleJob.Task({
      cacheTask: new OracleJob.CacheTask({
        cacheItems: [
          {
            variableName: "tulip_usdc_price",
            job: {
              tasks: [
                {
                  solanaAccountDataFetchTask: {
                    pubkey: "ExzpbWgczTgd8J58BrnESndmzBkRVfc6PhFjSGiQXgAB",
                  },
                },
                {
                  bufferLayoutParseTask: {
                    offset: 208,
                    endian:
                      OracleJob.BufferLayoutParseTask.Endian.LITTLE_ENDIAN,
                    type: OracleJob.BufferLayoutParseTask.BufferParseType.i64,
                  },
                },
              ],
            },
          },
        ],
      }),
    });
    const job = OracleJob.create({
      tasks: [cacheTask],
    });
    const ctx = new JobContext(
      taskRunner.ctx,
      PublicKey.default.toString(),
      job
    );
    // ctx.result = "";
    const result = await taskRunner.tasks.run(ctx, cacheTask);
    return {
      result: result,
      threw: false,
    };
  };

  afterEach(() => jest.restoreAllMocks());

  it(`Input is required to run`, async () => {
    try {
      const result = await runTask();
      expect(result.threw).toBe(false);
      expect(result.result?.toString()).toBe("");
    } catch (e: any) {
      console.log(e.stackTrace);
      console.log(e);
      throw e;
    }
  });
});
