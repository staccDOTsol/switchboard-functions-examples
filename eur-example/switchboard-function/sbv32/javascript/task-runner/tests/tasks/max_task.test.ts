import type { ITaskResult, TaskRunner } from "../../src";
import { JobContext } from "../../src";
import { TaskRunnerTestContext } from "../setup";

import { PublicKey } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";

describe(`MaxTask tests`, () => {
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

  const doTask = async (iTask: OracleJob.IMaxTask, input: ITaskResult = "") => {
    const ctx = new JobContext(
      taskRunner,
      "",
      OracleJob.fromObject({}),
      undefined,
      input
    );
    return await taskRunner.tasks.maxTask(ctx, iTask);
  };

  const runTask = async (props?: {
    tasks?: OracleJob.Task[];
    jobs?: OracleJob[];
    input?: string;
  }): Promise<{ threw: boolean; value?: Big }> => {
    try {
      const maxTask = new OracleJob.Task({
        maxTask: new OracleJob.MaxTask({
          tasks: props?.tasks,
          jobs: props?.jobs ?? null,
        }),
      });
      const job = OracleJob.create({
        tasks: [maxTask],
      });
      const ctx = new JobContext(
        taskRunner.ctx,
        PublicKey.default.toString(),
        job
      );
      const result = await taskRunner.tasks.run(ctx, maxTask);
      return {
        value: result.big,
        threw: false,
      };
    } catch (e) {
      return { threw: true };
    }
  };

  afterEach(() => jest.restoreAllMocks());

  it(`MaxTask type runs maxTask`, async () => {
    const response = new Big(-8151991);
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `maxTask`)
      .mockImplementation(async () => new Big(response));

    const result = await doTask({});
    expect(taskSpy).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual(response);
  });

  it(`MaxTask fails if no tasks or jobs are provided`, async () => {
    try {
      const result = await doTask({});
      throw new Error(`MaxTask failed to throw an error when MaxTask is empty`);
    } catch (error) {}

    try {
      const result = await doTask({ tasks: [] });
      throw new Error(`MaxTask failed to throw an error when tasks is empty`);
    } catch (error) {}

    try {
      const result = await doTask({ jobs: [] });
      throw new Error(`MaxTask failed to throw an error when jobs is empty`);
    } catch (error) {}
  });

  it(`MaxTask fails if a JsonParseTask is provided without input`, async () => {
    try {
      const result = await doTask({
        tasks: [
          OracleJob.Task.create({
            jsonParseTask: OracleJob.JsonParseTask.create({ path: `$` }),
          }),
        ],
      });
      throw new Error(
        `MaxTask failed to throw an error when JsonPath is provided with no input`
      );
    } catch (error) {}
  });

  it(`MaxTask passes if a ValueTask is provided without input`, async () => {
    const result = await doTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 248 }),
        }),
      ],
    });
    expect(result).toStrictEqual(new Big(248));
  });

  it(`Always returns the max value of tasks`, async () => {
    const result = await doTask(
      {
        tasks: [
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
        ],
      },
      citiesJson
    );
    expect(result).toStrictEqual(new Big(313));

    const newResult = await doTask({
      tasks: [
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 500 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 499.99 }),
        }),
        OracleJob.Task.create({
          valueTask: OracleJob.ValueTask.create({ value: 312 }),
        }),
      ],
    });
    expect(newResult).toStrictEqual(new Big(500));
  });

  it(`Jobs and tasks can be run together`, async () => {
    const response = new Big(8151991);

    const valueTaskSpy = jest
      .spyOn(taskRunner.tasks, `valueTask`)
      .mockImplementation(async () => new Big(10));

    const taskSpy = jest
      .spyOn(taskRunner.tasks, `httpTask`)
      .mockImplementation(async () => JSON.stringify(response));

    const result = await doTask({
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
              valueTask: OracleJob.ValueTask.create({ value: 312 }),
            }),
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
    expect(taskSpy).toHaveBeenCalledTimes(1);
    expect(valueTaskSpy).toHaveBeenCalledTimes(3);
    expect(result).toStrictEqual(response);
  });
});
