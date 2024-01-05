import type { TaskRunner } from "../../src";
import { JobContext } from "../../src";
import { TaskRunnerTestContext } from "../setup";

import { PublicKey } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";

describe(`MeanTask tests`, () => {
  let taskRunner: TaskRunner;

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
  });

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  const citiesJson = JSON.stringify({
    cities: [{ name: "Detroit", areaCode: 313 }],
  });

  const runTask = async (props?: {
    tasks?: OracleJob.Task[];
    jobs?: OracleJob[];
    input?: string;
  }): Promise<{ threw: boolean; value?: Big }> => {
    try {
      const meanTask = OracleJob.Task.create({
        meanTask: OracleJob.MeanTask.create({
          tasks: props?.tasks ?? [],
          jobs: props?.jobs ?? [],
        }),
      });
      const job = OracleJob.create({
        tasks: [meanTask],
      });

      const ctx = new JobContext(
        taskRunner.ctx,
        PublicKey.default.toString(),
        job
      );

      const result = await taskRunner.tasks.run(ctx, meanTask);
      return {
        value: result.big,
        threw: false,
      };
    } catch (e) {
      // console.error(e);
      return { threw: true };
    }
  };

  afterEach(() => jest.restoreAllMocks());

  it(`MeanTask type runs meanTask`, async () => {
    const response = new Big(-8151991);
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `meanTask`)
      .mockImplementation(async () => new Big(response));

    const result = await runTask();

    expect(result.threw).toBe(false);
    expect(result.value).toStrictEqual(response);
    expect(taskSpy).toHaveBeenCalledTimes(1);
  });

  it(`MeanTask fails if no tasks or jobs are provided`, async () => {
    let result = await runTask();
    expect(result.threw).toBe(true);
    expect(result.value).toBe(undefined);

    result = await runTask({ tasks: [] });
    expect(result.threw).toBe(true);
    expect(result.value).toBe(undefined);

    result = await runTask({ jobs: [] });
    expect(result.threw).toBe(true);
    expect(result.value).toBe(undefined);
  });

  it(`MeanTask fails if a JsonParseTask is provided without input`, async () => {
    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          jsonParseTask: OracleJob.JsonParseTask.create({ path: `$` }),
        }),
      ],
    });

    expect(result.threw).toBe(true);
    expect(result.value).toBe(undefined);
  });

  it(`MeanTask passes if a ValueTask is provided without input`, async () => {
    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 248 }),
        }),
      ],
    });

    expect(result.threw).toBe(false);
    expect(result.value).toStrictEqual(new Big(248));
  });

  it(`Returns the mean if an odd number of tasks are provided.`, async () => {
    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 1 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 3 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 5 }),
        }),
      ],
      // input: citiesJson,
    });

    expect(result.threw).toBe(false);
    expect(result.value).toStrictEqual(new Big(9 / 3));
  });

  it(`Returns the value if only 1 tasks is provided.`, async () => {
    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 100 }),
        }),
      ],
    });

    expect(result.threw).toBe(false);
    expect(result.value).toStrictEqual(new Big(100));
  });

  it(`Average test`, async () => {
    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 0 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 100 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 102 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 400 }),
        }),
      ],
    });

    expect(result.threw).toBe(false);
    expect(result.value).toStrictEqual(new Big(150.5));
  });

  it(`Jobs and tasks can be run together`, async () => {
    const response = 100;
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `httpTask`)
      .mockImplementation(async () => JSON.stringify(response));

    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 100 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 103 }),
        }),
      ],
      jobs: [
        OracleJob.create({
          tasks: [
            OracleJob.Task.create({
              httpTask: OracleJob.HttpTask.create(),
            }),
            OracleJob.Task.create({
              jsonParseTask: OracleJob.JsonParseTask.create({ path: "$" }),
            }),
          ],
        }),
      ],
    });

    expect(result.threw).toBe(false);
    expect(result.value).toStrictEqual(new Big(101));
    expect(taskSpy).toHaveBeenCalledTimes(1);
  });
});
