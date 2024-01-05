import type { ITaskResult, TaskRunner } from "../../src";
import { JobContext } from "../../src";
import { TaskRunnerTestContext } from "../setup";

import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";

describe(`DivideTask tests`, () => {
  let taskRunner: TaskRunner;

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
  });

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  afterEach(() => jest.restoreAllMocks());

  const doTask = async (scalar: number, input: ITaskResult = "") => {
    const ctx = new JobContext(
      taskRunner,
      "",
      OracleJob.fromObject({}),
      undefined,
      input ?? ""
    );
    return await taskRunner.tasks.run(
      ctx,
      OracleJob.Task.create({ divideTask: { scalar } })
    );
  };

  it(`DivideTask type runs divideTask`, async () => {
    const response = new Big(-8151991);
    const taskSpy = jest
      .spyOn(taskRunner.tasks, `divideTask`)
      .mockImplementation(async () => new Big(response));
    const result = await doTask(1, new Big(1));

    expect(result.big).toStrictEqual(response);
    expect(taskSpy).toHaveBeenCalledTimes(1);
  });

  it(`DividingTask divides scalar value properly`, async () => {
    const result = await doTask(10, new Big(10));
    expect(result.big).toStrictEqual(new Big(1));
  });

  it(`Running with anything other than a number as input fails`, async () => {
    try {
      const result = await doTask(10, "test");
      throw new Error(`DivideTask failed to throw expected error`);
    } catch (error) {}
  });

  it(`Dividing by 0 fails`, async () => {
    try {
      const result = await doTask(0, new Big(10));
      throw new Error(
        `DivideTask failed to throw expected error when dividing by 0`
      );
    } catch (error) {}
  });

  it(`A job param that doesn't return a number fails`, async () => {
    try {
      const ctx = new JobContext(
        taskRunner.ctx,
        "",
        OracleJob.fromObject({}),
        undefined,
        new Big(12)
      );
      const result = await taskRunner.tasks.divideTask(
        ctx,
        OracleJob.DivideTask.create({
          job: OracleJob.create({
            tasks: [],
          }),
        })
      );
      throw new Error(
        `DivideTask failed to throw expected error when a sub job fails`
      );
    } catch (error) {}
  });

  it(`A valid job param that returns a number passes`, async () => {
    const ctx = new JobContext(
      taskRunner.ctx,
      "",
      OracleJob.fromObject({}),
      undefined,
      new Big(12)
    );
    const result = await taskRunner.tasks.divideTask(
      ctx,
      OracleJob.DivideTask.create({
        job: OracleJob.create({
          tasks: [{ valueTask: { value: 3 } }],
        }),
      })
    );
    expect(result).toStrictEqual(new Big(4));
  });
});
