import { TaskRunnerCache } from "./ctx/cache/TaskRunnerCache.js";
import { Task } from "./ctx/task/index.js";
import type { IJobContext } from "./types/JobContext.js";
import { JobContext } from "./types/JobContext.js";
import { TaskReceipt } from "./types/TaskReceipt.js";
import { TaskResult } from "./types/TaskResult.js";
import type {
  ITaskRunner,
  ITaskRunnerCache,
  ITaskRunnerClients,
  ITaskRunnerLogger,
  ITaskType,
  TaskRunnerReceipt,
} from "./types/types.js";

import { Connection } from "@solana/web3.js";
import type { OracleJob } from "@switchboard-xyz/common";
import { serializeOracleJob } from "@switchboard-xyz/common";
import type * as sbv2 from "@switchboard-xyz/solana.js";
import dotenv from "dotenv";

dotenv.config();

export class TaskRunner implements ITaskRunner {
  // Solana config
  program: sbv2.SwitchboardProgram;
  solanaMainnetEndpoint: string;
  _solanaMainnetConnection?: Connection = undefined;

  logger: ITaskRunnerLogger;
  cache: ITaskRunnerCache;
  clients: ITaskRunnerClients;
  configs: Map<string, any>;

  constructor(
    program: sbv2.SwitchboardProgram,
    solanaMainnetEndpoint: string | Connection,
    clients: ITaskRunnerClients,
    logger: ITaskRunnerLogger = console,
    configs: Map<string, any> = new Map<string, any>()
  ) {
    this.program = program;

    if (typeof solanaMainnetEndpoint === "string") {
      this.solanaMainnetEndpoint = solanaMainnetEndpoint;
    } else {
      this._solanaMainnetConnection = solanaMainnetEndpoint;
      this.solanaMainnetEndpoint = solanaMainnetEndpoint.rpcEndpoint;
    }
    this.clients = clients;
    this.logger = logger;
    this.cache = new TaskRunnerCache(logger);
    this.configs = configs;
  }

  get solanaMainnetConnection(): Connection {
    try {
      if (this._solanaMainnetConnection === undefined) {
        this._solanaMainnetConnection = new Connection(
          this.solanaMainnetEndpoint
        );
      }
      return this._solanaMainnetConnection;
    } catch (error: any) {
      throw new Error(`SolanaMainnetConnectionError: ${error}`);
    }
  }

  get ctx(): ITaskRunner {
    return {
      program: this.program,
      solanaMainnetConnection: this.solanaMainnetConnection, // TODO: Make lazy load
      cache: this.cache,
      logger: this.logger,
      clients: this.clients,
      configs: this.configs,

      // we need to pass these down to let the JobContext execute any nested jobs
      runTask: this.runTask,
      perform: this.perform,
      performAsBuffer: this.performAsBuffer,
    };
  }

  get tasks(): Task {
    return Task.getInstance();
  }

  public async runTask(
    task: OracleJob.ITask,
    input?: string
  ): Promise<{
    result: string;
    numericResult: boolean;
    taskType: ITaskType;
    input: string;
  }> {
    const ctx = new JobContext(
      this.ctx,
      "",
      // validate the task
      serializeOracleJob({ tasks: [task] })
    );
    ctx.result = new TaskResult(input ?? "");

    const output = await ctx.task.run(ctx, task);
    const receipt = new TaskReceipt(task, ctx.result, output, 0);

    let isNumericResult = false;
    try {
      output.big;
      isNumericResult = true;
    } catch {}

    return {
      result: output.toString(),
      numericResult: isNumericResult,
      taskType: receipt.taskType,
      input: receipt.input.toString(),
    };
  }

  /**
   * Computes a JobResult given an OracleJob to run.
   * @param [jobKey] ID associated with the job for easier identification.
   * @param [job] The OracleJob that should be run.
   * @param [ctx] Optional, an existing job context to attach to the job for sharing cache and the current running result.
   * @throws {String}
   * @returns {Promise<TaskSimulatorReceipt>}
   */
  async perform(
    jobKey: string,
    job: OracleJob,
    ctx: IJobContext = new JobContext(this.ctx, jobKey, job)
  ): Promise<TaskRunnerReceipt> {
    let i = 0;
    let taskStartTime = Date.now();
    try {
      for await (const task of job.tasks) {
        taskStartTime = Date.now();
        const output = await Task.getInstance().run(ctx, task);
        const taskEndTime = Date.now();
        const taskLatency = taskEndTime - taskStartTime;
        ctx.receipts.push(
          new TaskReceipt(task, ctx.result, output, taskLatency)
        );
        ctx.result = output;
        i++;
      }
      return ctx.receipt;
    } catch (error) {
      const taskEndTime = Date.now();
      const lastIdx = i >= job.tasks.length ? job.tasks.length - 1 : i;
      const taskLatency = taskEndTime - taskStartTime;
      ctx.receipts.push(
        new TaskReceipt(
          job.tasks[lastIdx],
          ctx.result,
          new TaskResult(),
          taskLatency
        )
      );
      return {
        id: ctx.jobKey,
        error: error,
        errorTaskIndex: i,
        errorTask: job.tasks[i],
        tasks: job.tasks,
        results: ctx.receipts,
      };
    }
  }

  /**
   * Computes a JobResult given an OracleJob to run and return a buffer.
   * @param [jobKey] ID associated with the job for easier identification.
   * @param [job] The OracleJob that should be run.
   * @param [ctx] Optional, an existing job context to attach to the job for sharing cache and the current running result.
   * @throws {String}
   * @returns {Promise<TaskRunnerReceipt<Buffer>>}
   */
  async performAsBuffer(
    jobKey: string,
    job: OracleJob,
    ctx: IJobContext = new JobContext(this.ctx, jobKey, job)
  ): Promise<TaskRunnerReceipt<Buffer>> {
    let i = 0;
    const taskStartTime = Date.now();
    try {
      for await (const task of job.tasks) {
        const output = await Task.getInstance().run(ctx, task);
        const taskEndTime = Date.now();
        const taskLatency = taskEndTime - taskStartTime;
        ctx.receipts.push(
          new TaskReceipt(task, ctx.result, output, taskLatency)
        );
        ctx.result = output;
        i++;
      }
      return {
        id: ctx.jobKey,
        result: ctx.result.buffer,
        tasks: job.tasks,
        results: ctx.receipts,
      };
    } catch (error) {
      return {
        id: ctx.jobKey,
        error: error,
        errorTaskIndex: i,
        errorTask: job.tasks[i],
        tasks: job.tasks,
        results: ctx.receipts,
      };
    }
  }
}

export default TaskRunner;
