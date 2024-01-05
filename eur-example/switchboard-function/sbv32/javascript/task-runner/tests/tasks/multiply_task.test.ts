import type { ITaskResult, TaskRunner, TaskRunnerReceipt } from "../../src";
import { JobContext } from "../../src";
import { TaskRunnerTestContext } from "../setup";

import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";
import { strict as assert } from "assert";

describe(`MultiplyTask tests`, () => {
  let taskRunner: TaskRunner;

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
  });

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  const doTask = async (scalar: number, input: ITaskResult = "") => {
    const ctx = new JobContext(
      taskRunner,
      "",
      OracleJob.fromObject({}),
      undefined,
      input ?? ""
    );
    return await taskRunner.tasks.multiplyTask(ctx, { scalar });
  };

  const runTask = async (props?: {
    task?: OracleJob.MultiplyTask;
    input?: Big;
  }): Promise<TaskRunnerReceipt> => {
    return await taskRunner.perform(
      "",
      OracleJob.create({
        tasks: [
          OracleJob.Task.create({
            multiplyTask:
              props?.task ?? OracleJob.MultiplyTask.create({ scalar: 1 }),
          }),
        ],
      })
    );
  };

  afterEach(() => jest.restoreAllMocks());

  it(`MultiplyTask type runs multiplyTask`, async () => {
    const response = new Big(-8151991);
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `multiplyTask`)
      .mockImplementation(async () => new Big(response));

    // Run JsonParseTask with input.
    const receipt = await runTask({ input: new Big(1) });

    expect(taskSpy).toHaveBeenCalledTimes(1);

    if ("error" in receipt) {
      throw new Error(
        `MultiplyTask returned an unexpected error, ${receipt.error}`
      );
    }

    expect(receipt.result).toStrictEqual(response);
  });

  it(`MultiplyTask multiplies scalar value properly`, async () => {
    const result = await doTask(10, new Big(10));
    expect(result).toStrictEqual(new Big(100));
  });

  it(`Running with anything other than a number as input fails`, async () => {
    try {
      const result = await doTask(10, "");
      throw new Error(`MultiplyTask failed to throw expected error`);
    } catch (error) {}
  });

  it(`Multiplying by 0 fails`, async () => {
    try {
      const result = await doTask(0, new Big(10));
      throw new Error(
        `MultiplyTask failed to throw expected error when multiplying by 0`
      );
    } catch (error) {}
  });

  it(`A job param that doesn't return a number fails`, async () => {
    const receipt = await runTask({
      input: new Big(12),
      task: OracleJob.MultiplyTask.create({
        job: OracleJob.create({
          tasks: [],
        }),
      }),
    });

    assert("error" in receipt, `MultiplyTask failed to throw expected error`);
  });

  it(`A valid job param that returns a number passes`, async () => {
    const ctx = new JobContext(
      taskRunner.ctx,
      "",
      OracleJob.fromObject({ tasks: [] }),
      undefined,
      new Big(12)
    );

    try {
      const result = await taskRunner.tasks.multiplyTask(
        ctx,
        OracleJob.MultiplyTask.fromObject({
          scalar: 3,
        })
      );
      expect(result).toStrictEqual(new Big(36));
    } catch (error) {
      throw new Error(`MultiplyTask returned an unexpected error, ${error}`);
    }
  });

  // it(`A task that hits a cached pubkey will use the result`, async () => {
  //   const input = 12;
  //   const result = await runTask({
  //     input: input,
  //     task: OracleJob.MultiplyTask.create({
  //       aggregatorPubkey: cachedKeyVal.pubkey,
  //     }),
  //   });

  //   expect(result.threw).toBe(false);
  //   expect(result.value).toBe(input * cachedKeyVal.value);
  // });

  // it(`A task that hits a pubkey that isn't cached will get the result`, async () => {
  //   const responseValue = 4.5;
  //   const taskSpy = jest
  //     .spyOn(aggregatorUtil, `getAggregatorState`)
  //     .mockImplementation(async () =>
  //       Promise.resolve(
  //         AggregatorState.create({
  //           currentRoundResult: { result: responseValue, numSuccess: 0 },
  //         })
  //       )
  //     );
  //   const result = await runTask({
  //     input: 12,
  //     task: OracleJob.MultiplyTask.create({
  //       aggregatorPubkey: "BNiGJpc6zkmkk7Jir1ggRfyxFy2fwjMmt2BUDUEg4eBH",
  //     }),
  //   });

  //   expect(result.threw).toBe(false);
  //   expect(result.value).toBe(12 * responseValue);
  //   expect(taskSpy).toHaveBeenCalledTimes(1);
  // });
});
