import { OracleJob } from "@switchboard-xyz/common";

class HostnameDisabled extends Error {
  constructor(hostname: string) {
    super(`Hostname (${hostname}) disabled`);
    Object.setPrototypeOf(this, HostnameDisabled.prototype);
    this.stack = undefined;
  }
}

class TaskError extends Error {
  readonly iTask: string;
  readonly taskType: string;
  constructor(
    iTask: OracleJob.ITask,
    public readonly innerError: unknown,
    public readonly input = ""
  ) {
    const rawTaskType = OracleJob.Task.create(iTask).Task ?? "Unknown";
    const taskType = rawTaskType.charAt(0).toUpperCase() + rawTaskType.slice(1);

    super(
      `${taskType}: ${
        innerError instanceof Error
          ? innerError.message
          : JSON.stringify(innerError)
      }`
    );

    this.taskType = taskType;
    this.iTask = JSON.stringify(iTask);

    if (innerError instanceof Error && "stack" in innerError) {
      this.stack = innerError.stack;
    }

    Object.setPrototypeOf(this, TaskError.prototype);
  }
}

class JupiterSwapError extends Error {
  constructor(message: string) {
    super(`${message}`);
    Object.setPrototypeOf(this, JupiterSwapError.prototype);
    this.stack = undefined; // stack trace is useless
  }
}

class JupiterSwapRateLimitExceeded extends JupiterSwapError {
  constructor() {
    super(`API rate limit exceeded`);
    Object.setPrototypeOf(this, JupiterSwapRateLimitExceeded.prototype);
    this.stack = undefined; // stack trace is useless
  }
}

export {
  HostnameDisabled,
  JupiterSwapError,
  JupiterSwapRateLimitExceeded,
  TaskError,
};
