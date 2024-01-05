import type { TaskRunner } from "../src/index.js";
import { JobContext } from "../src/index.js";

import { TaskRunnerTestContext } from "./setup.js";
import { getValueTask } from "./task_utils.js";

import { PublicKey } from "@solana/web3.js";
import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";

describe("TaskRunner tests", () => {
  let taskRunner: TaskRunner;

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  describe("perform() tests", () => {
    it("Calls `run` for each Task in an OracleJob", async () => {
      const doTaskSpy = jest.spyOn(taskRunner.tasks, "run");

      const num = 10;
      const tasks = [...Array(10).keys()].map((n, i) => getValueTask(n + 1));
      const job = OracleJob.create({
        tasks,
      });
      const result = await taskRunner.perform(
        PublicKey.default.toString(),
        job
      );
      if ("error" in result) {
        throw new Error(`Job failed with error ${result.error}`);
      }

      // `run` has been called once for each task in the OracleJob
      expect(doTaskSpy).toHaveBeenCalledTimes(10);
      expect(result.result).toStrictEqual(new Big(10));
    });

    // it("If `doTask` returns null, job returns null immediately", async () => {
    //   let doTaskSpy = jest
    //     .spyOn(taskRunner, "doTask")
    //     .mockImplementation(async () => {
    //       return null as any;
    //     });

    //   let result = await taskRunner.perform(
    //     PublicKey.default.toString(),
    //     new OracleJob({
    //       tasks: [new OracleJob.Task(), new OracleJob.Task()],
    //     })
    //   );

    //   // If `doTask` returns null, null is returned immediately without performing
    //   // the rest of the tasks
    //   expect(result).toBe(null);
    //   expect(doTaskSpy).toHaveBeenCalledTimes(1);
    // });

    it("If result isn't a number, task runner throws an error", async () => {
      const task: OracleJob.ITask = {
        httpTask: {
          url: "http://google.com",
        },
      };
      const job = OracleJob.fromObject({
        tasks: [task],
      });
      const ctx = new JobContext(taskRunner.ctx, "", job);

      const doTaskSpy = jest
        .spyOn(taskRunner.tasks, "httpTask")
        .mockImplementation(async () => "not a number");

      try {
        const result = await taskRunner.perform("", job, ctx);
        expect(doTaskSpy).toHaveBeenCalledTimes(1);

        if (!("error" in result)) {
          throw new Error(
            `TaskRunner failed to throw an error when returning a non-numeric result`
          );
        }
      } catch (error) {}
    });

    it("NestJob calls each task", async () => {
      const httpTaskSpy = jest
        .spyOn(taskRunner.tasks, "httpTask")
        .mockImplementation(async () => "");

      const websocketSpy = jest
        .spyOn(taskRunner.tasks, "websocketTask")
        .mockImplementation(async () => "");

      const medianTaskSpy = jest.spyOn(taskRunner.tasks, "medianTask");
      // .mockImplementation(async () => new Big(1));

      const valueTaskSpy = jest
        .spyOn(taskRunner.tasks, "valueTask")
        .mockImplementation(async () => new Big(1));

      const addTaskSpy = jest
        .spyOn(taskRunner.tasks, "addTask")
        .mockImplementation(async () => new Big(1));

      const nestedJobs = OracleJob.fromObject({
        tasks: [
          { httpTask: { url: "" } },
          { websocketTask: { url: "" } },
          { valueTask: { value: 1 } },
          { addTask: { scalar: 1 } },
          {
            medianTask: {
              jobs: [
                { tasks: [{ valueTask: { value: 1 } }] },
                { tasks: [{ valueTask: { value: 1 } }] },
                { tasks: [{ valueTask: { value: 1 } }] },
              ],
            },
          },
          { addTask: { scalar: 1 } },
          { addTask: { scalar: 1 } },
          { addTask: { scalar: 1 } },
        ],
      });

      const receipt = await taskRunner.perform("", nestedJobs);
      if ("error" in receipt) {
        throw new Error(`NestedJob failed to yield a result`);
      }

      expect(httpTaskSpy).toHaveBeenCalledTimes(1);
      expect(websocketSpy).toHaveBeenCalledTimes(1);
      expect(medianTaskSpy).toHaveBeenCalledTimes(1);
      expect(valueTaskSpy).toHaveBeenCalledTimes(4);
      expect(addTaskSpy).toHaveBeenCalledTimes(4);
      expect(receipt.result).toStrictEqual(new Big(1));
    });
  });

  describe("Task.run() tests", () => {
    it("Task without a TaskType throws error", async () => {
      const emptyTask = new OracleJob.Task();
      const ctx = new JobContext(
        taskRunner.ctx,
        PublicKey.default.toString(),
        new OracleJob({ tasks: [emptyTask] })
      );
      try {
        const result = await taskRunner.tasks.run(ctx, emptyTask);
        throw new Error(
          `Task without a TaskType failed to throw expected error`
        );
      } catch (error) {}
    });

    it("HttpTask runs", async () => {
      const httpTask = OracleJob.Task.create({ httpTask: { url: "" } });
      const ctx = new JobContext(
        taskRunner.ctx,
        PublicKey.default.toString(),
        new OracleJob({ tasks: [httpTask] })
      );

      const httpTaskSpy = jest
        .spyOn(taskRunner.tasks, "httpTask")
        .mockImplementation(async () => "");
      const result = await taskRunner.tasks.run(ctx, httpTask);
      expect(httpTaskSpy).toHaveBeenCalledTimes(1);
    });

    it("ValueTask runs", async () => {
      const valueTask = OracleJob.Task.create({ valueTask: { value: 3 } });
      const ctx = new JobContext(
        taskRunner.ctx,
        PublicKey.default.toString(),
        new OracleJob({ tasks: [valueTask] })
      );

      const valueTaskSpy = jest
        .spyOn(taskRunner.tasks, "valueTask")
        .mockImplementation(async () => new Big(1));
      const result = await taskRunner.tasks.run(ctx, valueTask);
      expect(valueTaskSpy).toHaveBeenCalledTimes(1);
    });

    it("NonExistantTask fails", async () => {
      const ctx = new JobContext(
        taskRunner.ctx,
        PublicKey.default.toString(),
        new OracleJob({ tasks: [] })
      );

      try {
        const result = await taskRunner.tasks.run(ctx, {
          nonExistantTask: {},
        } as any);
        throw new Error(`NonExistantTask failed to throw expected error`);
      } catch (error) {}
    });
  });

  describe("variableExpand() tests", () => {
    it("replaces key in string", async () => {
      const ctx = new JobContext(
        taskRunner.ctx,
        "",
        OracleJob.fromObject({ tasks: [] })
      );
      const validKey = "key";
      const initialString = "${" + validKey + "}";
      const vars = { [validKey]: "123" };
      const result = ctx.variableExpand(initialString, vars);

      expect(result).toBe("123");
    });

    it("invalid keys are skipped", async () => {
      const ctx = new JobContext(
        taskRunner.ctx,
        "",
        OracleJob.fromObject({ tasks: [] })
      );
      const invalidKey = "*key$";
      const initialString = "${" + invalidKey + "}";
      const vars = { [invalidKey]: "123" };
      const result = ctx.variableExpand(initialString, vars);

      expect(result).toBe(initialString);
    });
  });
});
