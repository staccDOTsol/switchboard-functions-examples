import config from "./config/config.js";
import logger from "./config/logger.js";
import type {
  JobReceipt,
  SimulateRequest,
  SimulateResponse,
  SimulateResponseError,
  TaskReceipt,
} from "./models/simulate.model.js";
import type {
  TaskRequest,
  TaskResponse,
  TaskResponseError,
} from "./models/task.model.js";

import type {
  Big,
  ITaskResult,
  ITaskRunner,
  TaskRunnerReceipt,
} from "@switchboard-xyz/task-runner";
import { BigUtils, serializeOracleJob } from "@switchboard-xyz/task-runner";
import { TaskError } from "@switchboard-xyz/task-runner/errors";
import { TaskSimulator } from "@switchboard-xyz/task-runner/simulator";

const taskRunnerPkg = await import(
  "@switchboard-xyz/task-runner/package.json",
  { assert: { type: "json" } }
);

interface Simulators {
  devnet: ITaskRunner;
  mainnet: ITaskRunner;
}

export default class Runner {
  private static _instance: Runner | null = null;
  private static _instancePromise: Promise<Runner> | null = null;

  private constructor(
    private readonly simulators: Simulators,
    readonly taskRunnerVersion: string
  ) {}

  public static async getInstance(): Promise<Runner> {
    if (!Runner._instance) {
      if (!Runner._instancePromise) {
        Runner._instancePromise = new Promise<Runner>(
          async (resolve, reject) => {
            try {
              /// load task simulator
              const simulators: Simulators = await TaskSimulator.loadClusters(
                config.solanaMainnetEndpoint,
                config.solanaDevnetEndpoint,
                config.jupiterSwapApiKey,
                logger
              );
              const newInstance = new Runner(
                simulators,
                taskRunnerPkg.default.version
              );

              logger.info(`Task Runner initialized!`);
              Runner._instance = newInstance;
              resolve(newInstance);
            } catch (error) {
              reject(error);
            }
          }
        ).catch((error) => {
          logger.error(error);
          Runner._instancePromise = null;
          throw error;
        });
      }
      return Runner._instancePromise!;
    }
    return Runner._instance;
  }

  public async simulate(
    req: SimulateRequest
  ): Promise<SimulateResponse | SimulateResponseError> {
    try {
      const runner =
        req.cluster === "devnet"
          ? this.simulators.devnet
          : this.simulators.mainnet;

      const receipts: Array<TaskRunnerReceipt<Big>> = await Promise.all(
        req.jobs.map(async (iJob) => {
          const job = serializeOracleJob(iJob);
          const receipt = await runner.perform("", job);
          return receipt;
        })
      );

      const results: Array<Big | null> = receipts.map((r) => {
        if ("result" in r) {
          return r.result;
        }
        return null;
      });
      const validResults: Array<Big> = results.filter(
        (value): value is Big => !!value
      );

      if (validResults.length === 0) {
        let errorMessage = "Cannot take median of empty array";

        if (req.jobs.length === 1 && receipts.length > 0) {
          const jobReceipt = receipts[0];

          let jobFailureResult = getResult(jobReceipt);
          if (jobFailureResult.includes("\n")) {
            jobFailureResult = jobFailureResult.split("\n")[0];
          }

          errorMessage = `Cannot take median of empty array. Job Error: ${jobFailureResult}`;
        }

        const response: SimulateResponseError = {
          receipts: receipts.map((r): JobReceipt => {
            return {
              id: r.id,
              result: getResult(r),
              tasks: r.results.map((r): TaskReceipt => {
                return {
                  taskType: r.taskType as any,
                  input: r.input.toString(),
                  output: r.output.toString(),
                  task: r.task,
                };
              }),
            };
          }),
          results: results.map((r) =>
            typeof r === "string" ? r : r?.toString() ?? ""
          ),
          error: errorMessage,
          task_runner_version: this.taskRunnerVersion,
        };
        return response;
      }
      const finalResult: Big = BigUtils.median(validResults);
      const response: SimulateResponse = {
        result: finalResult.toString(),
        receipts: receipts.map((r): JobReceipt => {
          return {
            id: r.id,
            result: getResult(r),
            tasks: r.results.map((r): TaskReceipt => {
              return {
                taskType: r.taskType as any,
                input: r.input.toString(),
                output: r.output.toString(),
                task: r.task,
              };
            }),
          };
        }),
        results: results.map((r) =>
          typeof r === "string" ? r : r?.toString() ?? ""
        ),
        task_runner_version: this.taskRunnerVersion,
      };

      return response;
    } catch (error) {
      logger.error(
        `/simulate request failed for req: ${JSON.stringify(req)}\n${error}`
      );
      console.error(error);
      const response: SimulateResponseError = {
        error: toErrorString(error),
        results: [],
        receipts: [],
        task_runner_version: this.taskRunnerVersion,
      };
      return response;
    }
  }

  public async runTask(
    req: TaskRequest
  ): Promise<TaskResponse | TaskResponseError> {
    try {
      const runner =
        req.cluster === "devnet"
          ? this.simulators.devnet
          : this.simulators.mainnet;
      const { result, numericResult, taskType, input } = await runner.runTask(
        req.task,
        req.input
      );
      const response: TaskResponse = {
        result,
        numericResult,
        taskType: taskType as string,
        input,
        task_runner_version: this.taskRunnerVersion,
      };
      return response;
    } catch (error) {
      logger.error(
        `/task request failed for req: ${JSON.stringify(req)}\n${error}`
      );
      const response: TaskResponseError = {
        error: toErrorString(error),
        task_runner_version: this.taskRunnerVersion,
      };
      return response;
    }
  }
}

function toErrorString(error: unknown): string {
  return error instanceof Error ? error.message : (error as any).toString();
}

function getResult(obj: { result: ITaskResult } | { error: unknown }): string {
  if ("result" in obj) {
    return typeof obj.result === "string" ? obj.result : obj.result.toString();
  }

  if ("error" in obj) {
    if (obj.error instanceof TaskError) {
      return `${obj.error.message}\n${JSON.stringify(
        obj.error.iTask,
        undefined,
        2
      )}`;
    }

    if (obj.error instanceof Error) {
      return `ERROR: ${obj.error.message}`;
    }

    return typeof obj.error === "object"
      ? JSON.stringify(obj.error)
      : (obj.error as any);
  }

  return "";
}
