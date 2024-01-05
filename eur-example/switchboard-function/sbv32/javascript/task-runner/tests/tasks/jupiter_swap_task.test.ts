import type { TaskRunner } from "../../src";
import { JobContext } from "../../src";
import { TaskRunnerTestContext } from "../setup";

import { PublicKey } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";

describe(`JupiterSwapTask tests`, () => {
  let taskRunner: TaskRunner;

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  const runTask = async (props?: {
    value?: Big;
    input?: string;
  }): Promise<{ threw: boolean; value?: Big }> => {
    try {
      const task = new OracleJob.Task({
        jupiterSwapTask: new OracleJob.JupiterSwapTask({
          inTokenAddress: "5PmpMzWjraf3kSsGEKtqdUsCoLhptg4yriZ17LKKdBBy",
          outTokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          baseAmount: 1,
        }),
      });
      const job = OracleJob.create({
        tasks: [task],
      });
      const ctx = new JobContext(
        taskRunner.ctx,
        PublicKey.default.toString(),
        job
      );
      const result = await taskRunner.tasks.run(ctx, task);
      return {
        threw: false,
        value: result.big,
      };
    } catch (e) {
      return { threw: true };
    }
  };

  it(`JupiterSwapTask type runs JupiterSwapTask.`, async () => {
    // const res = await runTask({});
    // throw new Error(JSON.stringify(res));

    const response = new Big(-8151991);
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `jupiterSwapTask`)
      .mockImplementation(async () => new Big(response));

    const result = await runTask();

    expect(taskSpy).toHaveBeenCalledTimes(1);
    expect(result.threw).toBe(false);
    expect(result.value).toStrictEqual(response);
  });
});
