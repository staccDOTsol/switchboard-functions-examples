import { Task } from "../ctx/task/index.js";
import { isProduction, verboseLogger } from "../utils/misc.js";

import { TaskReceipt } from "./TaskReceipt.js";
import type { ITaskResult } from "./TaskResult.js";
import { TaskResult } from "./TaskResult.js";
import type {
  ITask,
  ITaskRunner,
  ITaskRunnerCache,
  ITaskRunnerClients,
  ITaskRunnerLogger,
  PerformJob,
  TaskRunnerReceipt,
  TaskRunnerSuccessReceipt,
} from "./types.js";

import type { Connection } from "@solana/web3.js";
import type { IOracleJob } from "@switchboard-xyz/common";
import { assertFulfilled, Big, OracleJob } from "@switchboard-xyz/common";
import type { SwitchboardProgram } from "@switchboard-xyz/solana.js";

export interface IJobContext {
  logger: ITaskRunnerLogger;
  solanaMainnetConnection: Connection;
  program: SwitchboardProgram;
  cache: ITaskRunnerCache;
  clients: ITaskRunnerClients;
  configs: Map<string, any>;
  task: ITask;
  isSimulator: boolean;

  jobKey: string;
  job: IOracleJob;

  result: TaskResult;
  receipts: Array<TaskReceipt>;
  receipt: TaskRunnerReceipt;

  perform: PerformJob;
  runSubTasks: (tasks: Array<OracleJob.ITask>) => Promise<TaskResult>;
  runSubTask: (task: OracleJob.ITask) => Promise<ITaskResult>;
  runSubJob: (job: IOracleJob) => Promise<TaskRunnerSuccessReceipt>;
  runSubJobsAndTasks: (iTask: {
    jobs?: Array<IOracleJob>;
    tasks?: Array<OracleJob.ITask>;
  }) => Promise<Array<ITaskResult>>;
  variableExpand: (input: string, vars: any) => string;
  cacheExpand: (iTask: OracleJob.ITask) => OracleJob.ITask;
  setCache: (variableName: string, value: ITaskResult) => void;
  new: (job?: IOracleJob) => IJobContext;
}

export class JobContext implements IJobContext {
  private _cache: Map<string, string>;

  result: TaskResult = new TaskResult();
  receipts: Array<TaskReceipt> = [];

  get isSimulator(): boolean {
    return +(process.env.SWITCHBOARD_TASK_SIMULATOR_ENABLED ?? "0") > 0;
  }

  constructor(
    readonly _runnerCtx: ITaskRunner,
    readonly jobKey: string,
    readonly job: IOracleJob,
    cache?: Map<string, string>,
    result?: ITaskResult | undefined
  ) {
    this.result = new TaskResult(result);
    this._cache = cache ?? new Map<string, string>();
  }

  get logger() {
    return this._runnerCtx?.logger ?? console;
  }
  get solanaMainnetConnection() {
    return this._runnerCtx.solanaMainnetConnection;
  }
  get program() {
    return this._runnerCtx.program;
  }
  get cache() {
    return this._runnerCtx.cache;
  }
  get clients() {
    return this._runnerCtx.clients;
  }
  get configs() {
    return this._runnerCtx.configs;
  }
  get task(): ITask {
    return Task.getInstance();
  }
  get jobCache(): Map<string, string> {
    return this._cache;
  }
  get perform() {
    return this._runnerCtx.perform;
  }
  get receipt(): TaskRunnerReceipt {
    return {
      id: this.jobKey,
      result: this.result.big,
      tasks: (this.job.tasks ?? []).map((t) => this.cacheExpand(t)),
      results: this.receipts,
    };
  }

  /** Create a new JobContext instance with an identical cache and running result */
  new(job: IOracleJob = this.job): JobContext {
    return new JobContext(
      this._runnerCtx,
      this.jobKey,
      job,
      this._cache,
      this.result.toString()
    );
  }

  /**
   * Run a set of sub tasks with the parent tasks' ctx and cache
   * @param tasks - the sub tasks to run
   * @returns list of task-runner results
   */
  async runSubTasks(tasks: Array<OracleJob.ITask>): Promise<TaskResult> {
    const subCtx = this.new(OracleJob.fromObject({ tasks: tasks }));
    for await (const task of tasks) {
      const startTime = Date.now();
      const output = await this.task.run(subCtx, task);
      const endTime = Date.now();
      const subTaskLatency = endTime - startTime;
      subCtx.receipts.push(
        new TaskReceipt(task, subCtx.result, output, subTaskLatency)
      );
      subCtx.result = output;
    }
    return subCtx.result;
  }

  /**
   * Run a sub task with the parent tasks' ctx and cache
   * @param task - the sub task to run
   * @returns task-runner result
   */
  async runSubTask(task: OracleJob.ITask): Promise<ITaskResult> {
    const subCtx = this.new(OracleJob.fromObject({ tasks: [task] }));
    const result = await this.task.run(subCtx, task);
    return result.value;
  }

  /**
   * Run a sub job with the parent tasks' ctx and cache
   * @param iJob - the sub job to run
   * @throws an error if the sub job failed to resolve a single numerical result
   * @returns task runner receipt
   */
  async runSubJob(iJob: IOracleJob): Promise<TaskRunnerSuccessReceipt> {
    const job = OracleJob.fromObject(iJob);
    const subCtx = this.new(job);
    const receipt = await this._runnerCtx.perform(this.jobKey, job, subCtx);

    if ("error" in receipt) {
      throw new Error(
        `NestedJobError: failed to run sub job with errror, ${receipt.error}`
      );
    }
    return receipt;
  }

  /**
   * Run a set of sub jobs and tasks with the parent tasks' ctx and cache
   * @param iJob - the sub job to run
   * @returns list of task-runner results for any successful jobs
   */
  async runSubJobsAndTasks(iTask: {
    jobs?: Array<IOracleJob>;
    tasks?: Array<OracleJob.ITask>;
  }): Promise<Array<ITaskResult>> {
    const runSubTask = async (task: OracleJob.ITask): Promise<ITaskResult> => {
      const result: ITaskResult = await this.runSubTask(task);
      return result;
    };
    const runSubJob = async (iJob: IOracleJob): Promise<ITaskResult> => {
      const receipt: TaskRunnerSuccessReceipt = await this.runSubJob(iJob);
      return receipt.result;
    };

    const promises: Array<Promise<ITaskResult>> = [
      ...((iTask.tasks ?? []).map((task) => runSubTask(task)) ?? []),
      ...((iTask.jobs ?? []).map((iJob) => runSubJob(iJob)) ?? []),
    ];

    const promiseResults = await Promise.allSettled(promises);

    const rejected: Array<unknown> = [];
    const results: Array<ITaskResult> = [];
    for (const p of promiseResults) {
      if (p.status === "fulfilled") {
        results.push(p.value);
      } else {
        rejected.push(p.reason);
      }
    }

    if (!results.length) {
      if (rejected.length) {
        // lazy, take the first error
        // generally they're all the same
        const err = rejected.shift();
        throw err;
      }

      throw new Error(`SubCtx failed to yield any results`);
    }

    return results;
  }

  /** Set a CACHE_KEY for the current running job context */
  setCache(variableName: string, value: ITaskResult) {
    if (!variableName || variableName === "") {
      return;
    }
    let cacheValue: string;
    if (typeof value === "string") {
      cacheValue = value;
    } else {
      const oldDP = Big.DP;
      Big.DP = 20;
      const oldRM = Big.RM;
      Big.RM = 1;
      cacheValue = value.toString();
      Big.DP = oldDP;
      Big.RM = oldRM;
    }
    // remove leading and trailing single or double quotes
    // workerpool has a tendency to add these when sending across shared memory
    cacheValue = cacheValue.replace(/^["'](.+(?=["']$))["']$/, "$1");
    this.jobCache.set(variableName, cacheValue);
  }

  /** Replace any CACHE_KEYS within a task definition with the current running jobCache */
  cacheExpand<T extends OracleJob.ITask>(iTask: T): T {
    if (this.jobCache.size === 0) {
      return iTask;
    }

    const regex = /^([a-zA-Z0-9_-]+)$/;
    let out = JSON.stringify(iTask).slice();
    for (const [key, value] of this.jobCache.entries()) {
      const isValidKey = key.toString().match(regex);
      if (!isValidKey) {
        console.warn(`Warn: Invalid expansion key found: ${key}. Ignoring.`);
        continue;
      }
      out = out.replaceAll("${" + key + "}", value);
    }

    return JSON.parse(out);
  }

  /** Use the TaskRunner jobConfigs to expand any variables from a stored configuration */
  variableExpand(input: string, vars: any): string {
    let out = input.slice();
    for (const key of Object.keys(vars)) {
      const regex = /^([a-zA-Z0-9_-]+)$/;
      const isValidKey = key.toString().match(regex);
      if (!isValidKey) {
        this.logger.warn(
          `Warn: Invalid expansion key found: ${key}. Ignoring.`
        );
        continue;
      }
      const value = vars[key];
      out = out.replaceAll("${" + key + "}", value);
    }
    return out;
  }
}
