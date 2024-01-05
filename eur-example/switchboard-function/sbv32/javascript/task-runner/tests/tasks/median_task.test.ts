import type { TaskResult, TaskRunner } from "../../src";
import { JobContext } from "../../src";
import { TaskRunnerTestContext } from "../setup";

import { PublicKey } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";

describe(`MedianTask tests`, () => {
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

  const doTask = async (
    input: string,
    tasks: OracleJob.ITask[]
  ): Promise<TaskResult> => {
    const ctx = new JobContext(
      taskRunner,
      "",
      OracleJob.fromObject({}),
      undefined,
      input ?? ""
    );
    return await taskRunner.tasks.run(
      ctx,
      OracleJob.Task.create({ medianTask: { tasks } })
    );
  };

  const runTask = async (props?: {
    tasks?: OracleJob.Task[];
    jobs?: OracleJob[];
    input?: string;
  }): Promise<{ threw: boolean; result?: TaskResult }> => {
    try {
      const medianTask = new OracleJob.Task({
        medianTask: new OracleJob.MedianTask({
          tasks: props?.tasks,
          jobs: props?.jobs,
        }),
      });
      const job = OracleJob.create({
        tasks: [medianTask],
      });
      const ctx = new JobContext(
        taskRunner.ctx,
        PublicKey.default.toString(),
        job
      );
      const result = await taskRunner.tasks.run(ctx, medianTask);
      return {
        result: result,
        threw: false,
      };
    } catch (e) {
      return { threw: true };
    }
  };

  afterEach(() => jest.restoreAllMocks());

  it(`MedianTask type runs medianTask`, async () => {
    const response = new Big(-8151991);
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `medianTask`)
      .mockImplementation(async () => new Big(response));
    const { result, threw } = await runTask({ input: "" });

    expect(threw).toBe(false);
    expect(result?.big).toStrictEqual(response);
    expect(taskSpy).toHaveBeenCalledTimes(1);
  });

  it(`MedianTask fails if no tasks or jobs are provided`, async () => {
    let result = await runTask();
    expect(result.threw).toBe(true);
    expect(result.result).toBe(undefined);

    result = await runTask({ tasks: [] });
    expect(result.threw).toBe(true);
    expect(result.result).toBe(undefined);

    result = await runTask({ jobs: [] });
    expect(result.threw).toBe(true);
    expect(result.result).toBe(undefined);
  });

  it(`MedianTask fails if a JsonParseTask is provided without input`, async () => {
    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          jsonParseTask: OracleJob.JsonParseTask.create({ path: `$` }),
        }),
      ],
    });

    expect(result.threw).toBe(true);
    expect(result.result).toBe(undefined);
  });

  it(`MedianTask passes if a ValueTask is provided without input`, async () => {
    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 248 }),
        }),
      ],
    });

    expect(result.threw).toBe(false);
    expect(result.result?.big).toStrictEqual(new Big(248));
  });

  it(`Returns the median if an odd number of tasks are provided.`, async () => {
    const result = await doTask(citiesJson, [
      OracleJob.Task.create({
        valueTask: OracleJob.ValueTask.create({ value: 100 }),
      }),
      OracleJob.Task.create({
        jsonParseTask: OracleJob.JsonParseTask.create({
          path: `$.cities[?(@.name == 'Detroit')].areaCode`,
        }),
      }),
      OracleJob.Task.create({
        valueTask: OracleJob.ValueTask.create({ value: 312 }),
      }),
    ]);

    expect(result.big).toStrictEqual(new Big(312));
  });

  it(`Returns the average if an even number of tasks are provided.`, async () => {
    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 100 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 102 }),
        }),
      ],
    });

    expect(result.threw).toBe(false);
    expect(result.result?.big).toStrictEqual(new Big(101));
  });

  it(`Tasks outside of the middle 2 are ignored for a longer (even numbered) list of taks.`, async () => {
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
    expect(result.result?.big).toStrictEqual(new Big(101));
  });

  it(`Jobs and tasks can be run together`, async () => {
    const response = new Big(232);
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `httpTask`)
      .mockImplementation(async () => JSON.stringify(response));

    const result = await runTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 100 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 312 }),
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
    expect(result.result?.big).toStrictEqual(response);
    expect(taskSpy).toHaveBeenCalledTimes(1);
  });
});
