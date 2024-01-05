import "jest";

import type { ITaskResult, TaskRunner } from "../../src";
import { JobContext } from "../../src";
import { TaskRunnerTestContext } from "../setup";

import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";

describe(`ConditionalTask tests`, () => {
  let taskRunner: TaskRunner;

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
    process.env.DISABLE_WORKERPOOL = "1";
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => (process.env.DISABLE_WORKERPOOL = undefined));

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  const doTask = async (
    iTask: OracleJob.IConditionalTask,
    input: ITaskResult = ""
  ) => {
    const ctx = new JobContext(
      taskRunner.ctx,
      "",
      OracleJob.fromObject({ tasks: [iTask] }),
      undefined,
      input
    );
    return taskRunner.tasks.conditionalTask(ctx, iTask);
  };

  it(`ConditionalTask type runs conditionalTask`, async () => {
    const response = new Big(-8151991);
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `conditionalTask`)
      .mockImplementation(async () => new Big(response));
    const result = await doTask({ onFailure: [], attempt: [] });
    expect(taskSpy).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual(response);
  });

  it(`ConditionalTask throws if 'attempt' or 'onFailure' fields are missing`, async () => {
    try {
      const result = await doTask({
        onFailure: [{ valueTask: { value: 1 } }],
      });
      throw new Error(
        `ConditionalTask failed to throw an error when 'attempt' was not provided`
      );
    } catch (error) {}

    try {
      const result = await doTask({
        attempt: [{ httpTask: { url: "" } }],
      });
      throw new Error(
        `ConditionalTask failed to throw an error when 'onFailure' was not provided`
      );
    } catch (error) {}
  });

  it(`If 'attempt' returns a number it should be used`, async () => {
    const response = new Big(1337.1337);
    const result = await doTask({
      attempt: [{ valueTask: { value: response.toNumber() } }],
      onFailure: [{ valueTask: { value: 1 } }],
    });
    expect(result).toStrictEqual(response);
  });

  it(`If 'attempt' fails, but 'onFailure' returns a number it should be used`, async () => {
    const response = new Big(7331.7331);
    const result = await doTask({
      attempt: [], // Will fail because no tasks were provided.
      onFailure: [{ valueTask: { value: response.toNumber() } }],
    });
    expect(result).toStrictEqual(response);
  });

  it(`If 'attempt' and 'onFailure' both fail, ConditionalTask will throw`, async () => {
    try {
      const result = await doTask({
        attempt: [], // Will fail because no tasks were provided.
        onFailure: [], // Will also fail because no tasks were provided.
      });
      throw new Error(
        `ConditionalTask failed to throw expected error when 'attempt' and 'onFailure' throw`
      );
    } catch (error) {}
  });

  it(`Previous input data can be used to generate a response from 'attempt'.`, async () => {
    const result = await doTask(
      {
        attempt: [{ addTask: { scalar: 10 } }],
        onFailure: [{ valueTask: { value: 0 } }],
      },
      new Big(10)
    );
    expect(result).toStrictEqual(new Big(20));
  });

  it(`Previous input data can be used to generate a response from 'onFalure'.`, async () => {
    const result = await doTask(
      {
        attempt: [{ httpTask: { url: "" } }],
        onFailure: [{ addTask: { scalar: 10 } }],
      },
      new Big(10)
    );
    expect(result).toStrictEqual(new Big(20));
  });
});
