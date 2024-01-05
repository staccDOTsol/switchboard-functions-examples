import { extractBooleanEnvVar } from "../../utils";

import type { Idl } from "@coral-xyz/anchor";
import type * as spl from "@solana/spl-token";
import type { OracleJob } from "@switchboard-xyz/common";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import workerpool from "workerpool";

dotenv.config();

export interface ITaskRunnerWorker {
  enabled: boolean;
  jsonPathEnabled: boolean;
  twapEnabled: boolean;
  worker: workerpool.WorkerPool;
  twap: (
    iTwapTask: OracleJob.ITwapTask,
    [start, end]: [number, number],
    solanaMainnetEndpoint: string,
    programId: string,
    idl: Idl,
    mint: spl.Mint
  ) => Promise<string>;
  jsonPath: (jsonPath: string, data: string) => Promise<string>;
  jsonPathArray: (jsonPath: string, data: any) => Promise<string>;
}

// const parseDisabledFlag = (val: string | undefined): boolean =>
// Boolean(val ?? false);

export class TaskRunnerWorker implements ITaskRunnerWorker {
  private static _instance: TaskRunnerWorker;

  public readonly enabled: boolean;
  public readonly jsonPathEnabled: boolean;
  public readonly twapEnabled: boolean;

  private constructor() {
    this.enabled = !extractBooleanEnvVar("TASK_RUNNER_WORKER_DISABLED");
    console.log(`TASK_RUNNER_WORKER_ENABLED: ${this.enabled}`);

    this.jsonPathEnabled = !extractBooleanEnvVar(
      "TASK_RUNNER_WORKER_JSON_PATH_DISABLED"
    );
    console.log(
      `TASK_RUNNER_WORKER_JSON_PATH_ENABLED: ${this.jsonPathEnabled}`
    );

    this.twapEnabled = !extractBooleanEnvVar(
      "TASK_RUNNER_WORKER_TWAP_DISABLED"
    );
    console.log(`TASK_RUNNER_WORKER_TWAP_ENABLED: ${this.twapEnabled}`);
  }

  public static getInstance(): TaskRunnerWorker {
    if (!TaskRunnerWorker._instance) {
      TaskRunnerWorker._instance = new TaskRunnerWorker();
    }

    return TaskRunnerWorker._instance;
  }

  async kill() {
    return await this.worker.terminate();
  }

  _worker?: workerpool.WorkerPool;

  get worker(): workerpool.WorkerPool {
    if (!this.enabled) {
      throw new Error("TaskRunnerWorker disabled");
    }

    if (this._worker === undefined) {
      // first check if cjs worker is present (preferred)
      // then check if normal js worker is present
      // finally check the test location if NODE_ENV is not production
      if (fs.existsSync(path.join(__dirname, "taskRunner.worker.cjs"))) {
        this._worker = workerpool.pool(
          path.join(__dirname, "taskRunner.worker.cjs"),
          {
            workerType: "thread",
            // TODO: Assess, need to reserve some CPU threads for VRF events
            minWorkers: process.env.WORKERPOOL_COUNT
              ? Number.parseInt(process.env.WORKERPOOL_COUNT)
              : "max",
          }
        );
      } else if (fs.existsSync(path.join(__dirname, "taskRunner.worker.js"))) {
        this._worker = workerpool.pool(
          path.join(__dirname, "taskRunner.worker.js"),
          {
            workerType: "thread",
            // TODO: Assess, need to reserve some CPU threads for VRF events
            minWorkers: process.env.WORKERPOOL_COUNT
              ? Number.parseInt(process.env.WORKERPOOL_COUNT)
              : "max",
          }
        );
      } else {
        if (process.env.NODE_ENV && process.env.NODE_ENV === "production") {
          throw new Error(`Failed to locate taskRunner.worker.js`);
        }

        const devLocation = path.join(
          __dirname,
          "..",
          "..",
          "..",
          "lib",
          "ctx",
          "worker",
          "taskRunner.worker.cjs"
        );
        if (fs.existsSync(devLocation)) {
          this._worker = workerpool.pool(devLocation, {
            workerType: "thread",
            // TODO: Assess, need to reserve some CPU threads for VRF events
            minWorkers: process.env.WORKERPOOL_COUNT
              ? Number.parseInt(process.env.WORKERPOOL_COUNT)
              : "max",
          });
        } else {
          throw new Error(`Failed to locate taskRunner.worker.js`);
        }
      }
    }
    return this._worker;
  }

  async twap(
    iTwapTask: OracleJob.ITwapTask,
    [start, end]: [number, number],
    solanaEndpoint: string
  ): Promise<string> {
    if (!this.twapEnabled) {
      throw new Error("TaskRunnerWorker disabled for TWAP tasks");
    }
    const result: string = await this.worker.exec("twap", [
      iTwapTask,
      [start, end], // BN.js cant be encoded by Node.js worker
      solanaEndpoint,
    ]);

    return result;
  }

  async jsonPath(jsonPath: string, data: string): Promise<string> {
    if (!this.jsonPathEnabled) {
      throw new Error("TaskRunnerWorker disabled for JSON path tasks");
    }
    const result = await this.worker.exec("jsonPath", [jsonPath, data]);
    if (result instanceof Error) throw result;
    return result;
  }

  async jsonPathArray(jsonPath: string, data: any): Promise<string> {
    if (!this.jsonPathEnabled) {
      throw new Error("TaskRunnerWorker disabled for JSON path tasks");
    }
    const result = await this.worker.exec("jsonPathArray", [jsonPath, data]);
    if (result instanceof Error) throw result;
    return result;
  }
}
