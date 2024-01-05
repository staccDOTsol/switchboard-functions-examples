import type { TaskRunner } from "../../src/index.js";
import { JobContext } from "../../src/index.js";
import { TaskRunnerTestContext } from "../setup.js";

import { PublicKey } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";

describe(`ValueTask tests`, () => {
  let taskRunner: TaskRunner;

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
  });

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  const runTask = async (props?: {
    value?: Big;
    input?: string;
  }): Promise<{ threw: boolean; value?: Big }> => {
    try {
      const valueTask = new OracleJob.Task({
        valueTask: new OracleJob.ValueTask({
          value: props?.value?.toNumber() ?? undefined,
        }),
      });
      const job = OracleJob.create({
        tasks: [valueTask],
      });
      const ctx = new JobContext(
        taskRunner.ctx,
        PublicKey.default.toString(),
        job
      );
      const result = await taskRunner.tasks.run(ctx, valueTask);
      return {
        value: result.big,
        threw: false,
      };
    } catch (e) {
      return { threw: true };
    }
  };

  afterEach(() => jest.restoreAllMocks());

  it(`ValueTask type runs valueTask.`, async () => {
    const response = new Big(-8151991);
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `valueTask`)
      .mockImplementation(async () => new Big(response));

    const result = await runTask();

    expect(result.threw).toBe(false);
    expect(result.value).toStrictEqual(response);
    expect(taskSpy).toHaveBeenCalledTimes(1);
  });

  it(`Task returns 'value'.`, async () => {
    const value = new Big(1337.1337);

    const result = await runTask({ value: value });

    expect(result.threw).toBe(false);
    expect(result.value).toStrictEqual(value);
  });

  it(`Throws if no 'value' is provided.`, async () => {
    const result = await runTask();

    expect(result.threw).toBe(true);
    expect(result.value).toBe(undefined);
  });
});
