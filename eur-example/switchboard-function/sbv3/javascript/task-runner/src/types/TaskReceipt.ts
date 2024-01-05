import type { TaskResult } from "./TaskResult.js";
import type { ITaskType } from "./types.js";

import { OracleJob } from "@switchboard-xyz/common";

export interface ITaskReceipt {
  readonly taskType: ITaskType;
  readonly task: OracleJob.ITask;
  readonly input: TaskResult;
  readonly output: TaskResult;
  readonly taskLatency: number;
  toJSON(): Record<string, any>;
}

export class TaskReceipt implements ITaskReceipt {
  readonly taskType: ITaskType;
  constructor(
    readonly task: OracleJob.ITask,
    readonly input: TaskResult,
    readonly output: TaskResult,
    readonly taskLatency: number
  ) {
    this.taskType = OracleJob.Task.fromObject(this.task).Task!;
  }

  toJSON() {
    return {
      taskType: this.taskType,
      input: this.input.toString(),
      output: this.output.toString(),
      task: this.task,
      taskLatency: this.taskLatency.toString(),
    };
  }
}
