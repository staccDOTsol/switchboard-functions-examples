import { DEFAULT_COMMITMENT } from "../../chains/solana/types";
import { BaseEnvironment } from "../../env/BaseEnvironment";
import { NodeEnvironment } from "../../env/NodeEnvironment";
import { SolanaEnvironment } from "../../env/SolanaEnvironment";
import { DEFAULT_LABELS, NodeMetrics } from "../metrics";

import type { Span } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AwsProvider } from "@switchboard-xyz/node/aws";
import { FsProvider } from "@switchboard-xyz/node/fs";
import { GcpProvider } from "@switchboard-xyz/node/gcp";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import { SB_V2_PID, SwitchboardProgram } from "@switchboard-xyz/solana.js";
import type {
  ITaskRunnerClients,
  ITaskRunnerLogger,
  OracleJob,
  TaskRunnerReceipt,
} from "@switchboard-xyz/task-runner";
import {
  Big,
  BigUtils,
  receiptSuccess,
  TaskRunner,
} from "@switchboard-xyz/task-runner";
import { TaskRunnerClients } from "@switchboard-xyz/task-runner/ctx";
import {
  HostnameDisabled,
  JupiterSwapError,
  JupiterSwapRateLimitExceeded,
  TaskError,
} from "@switchboard-xyz/task-runner/errors";

const HOSTNAME_DISABLLED_REGEX = new RegExp(
  /Hostname \((?![\w\.,'()@&\s-]*\.$)[\w\.,'()@&\s-]*\) disabled/
);

function isHostnameDisabled(str: string): boolean {
  return HOSTNAME_DISABLLED_REGEX.test(str);
}

// Should we extend or add as a member ??
export class SwitchboardTaskRunner extends TaskRunner {
  constructor(
    program: SwitchboardProgram,
    mainnetEndpoint: Connection | string,
    clients: ITaskRunnerClients,
    logger: ITaskRunnerLogger,
    jobConfigs?: Map<string, any>
  ) {
    super(program, mainnetEndpoint, clients, logger, jobConfigs);
  }

  // Here we can add connection fail over logic or task runner error handling

  public static async loadTaskRunnerConfigs(): Promise<Map<string, any>> {
    const fileParser = (fileString: string): Map<string, any> => {
      const configs: Map<string, any> = JSON.parse(fileString);
      if (configs.size === 0) {
        throw new Error(`Failed to read any configs for provided file`);
      }
      return configs;
    };

    const env = BaseEnvironment.getTaskRunnerConfig();

    if (env.GCP_CONFIG_BUCKET) {
      NodeLogger.getInstance().env("GCP_CONFIG_BUCKET", env.GCP_CONFIG_BUCKET);
      try {
        const config = await GcpProvider.getBucket(
          env.GCP_CONFIG_BUCKET,
          fileParser
        );
        NodeLogger.getInstance().debug(
          "Job configs loaded from GCP bucket.",
          "TaskRunner"
        );
        return config;
      } catch (e) {
        NodeLogger.getInstance().warn(
          "Warning: GCP config bucket path provided but failed to load. Ignoring...",
          "TaskRunner"
        );
      }
    }

    if (env.AWS_CONFIG_BUCKET) {
      NodeLogger.getInstance().env("AWS_CONFIG_BUCKET", env.AWS_CONFIG_BUCKET);
      try {
        const config = await AwsProvider.getBucket(
          env.AWS_CONFIG_BUCKET,
          fileParser
        );
        NodeLogger.getInstance().debug(
          "Job configs loaded from AWS S3 bucket.",
          "TaskRunner"
        );
        return config;
      } catch (e) {
        NodeLogger.getInstance().warn(
          "Warning: AWS config bucket path provided but failed to load. Ignoring...",
          "TaskRunner"
        );
      }
    }

    try {
      const config = FsProvider.getBucket("configs.json", fileParser);
      NodeLogger.getInstance().debug("Node configs loaded.", "TaskRunner");
      return config;
    } catch (e) {}

    NodeLogger.getInstance().debug(
      "No job configs found. Continuing..",
      "TaskRunner"
    );
    return new Map<string, any>();
  }

  public static async load(): Promise<SwitchboardTaskRunner> {
    const taskRunnerConfigs =
      await SwitchboardTaskRunner.loadTaskRunnerConfigs();

    const env = BaseEnvironment.getTaskRunnerConfig();

    const chain = NodeEnvironment.getInstance().CHAIN;

    let program: SwitchboardProgram;
    let mainnetConnection: Connection;
    let solanaProgramId = SB_V2_PID;

    // solana-mainnet, re-use mainnetConnection and override programId
    // solana-devnet, use the devnet SwitchboardProgram
    // others, use TASK_RUNNER_SOLANA_RPC to build mainnet SwitchboardProgram
    if (chain === "solana") {
      const env = SolanaEnvironment.getInstance();

      // set mainnetConnection
      mainnetConnection = env.mainnetSolanaConnection;

      // set programId
      const programId =
        (
          await env.connection.getAccountInfo(
            (SolanaEnvironment.getOracleKey() ??
              SolanaEnvironment.getQueueKey())!
          )
        )?.owner ?? PublicKey.default;
      if (programId.equals(PublicKey.default)) {
        NodeLogger.getInstance().error(
          `Failed to fetch the oracles account owner`
        );
      } else {
        solanaProgramId = programId;
      }

      // set program with no payer
      program = await SwitchboardProgram.load(env.connection);
    }

    if (!program) {
      if (!env.TASK_RUNNER_SOLANA_RPC) {
        throw new Error(
          `Need to provide $TASK_RUNNER_SOLANA_RPC in order to use the Switchboard task runner.`
        );
      }
      mainnetConnection = new Connection(env.TASK_RUNNER_SOLANA_RPC, {
        commitment: DEFAULT_COMMITMENT,
      });

      program = await SwitchboardProgram.load(mainnetConnection);
    }

    // NodeLogger.getInstance().env(
    // "TASK_RUNNER_SOLANA_RPC",
    // mainnetConnection.rpcEndpoint
    // );

    const clients = new TaskRunnerClients(
      program,
      mainnetConnection,
      env.JUPITER_SWAP_API_KEY,
      NodeLogger.getInstance()
    );

    return new SwitchboardTaskRunner(
      program,
      mainnetConnection,
      clients,
      NodeLogger.getInstance(),
      taskRunnerConfigs
    );
  }

  private async runJob(job: IJobDefinition, id = ""): Promise<JobResult> {
    const span: Span | undefined =
      NodeMetrics.getInstance()?.startJobTracer(job.jobKey) ?? undefined;

    const jobStartTime = Date.now();
    const receipt: TaskRunnerReceipt<Big> = await this.perform(
      job.jobKey,
      job.job
    );

    try {
      receipt.results.map((task) => {
        const taskTypeKey = task.taskType.toString();
        const taskTypeKV =
          NodeMetrics.getInstance()?.taskTypeMap.get(taskTypeKey);
        NodeMetrics.getInstance()?.taskTypeMap.set(
          taskTypeKey,
          taskTypeKV ? taskTypeKV + 1 : 1
        );
        NodeMetrics.getInstance()?.recordTaskLatency(
          task.taskLatency,
          job.jobKey.toString(),
          task.taskType.toString()
        );
      });
    } catch {}

    if (receiptSuccess(receipt)) {
      const jobSuccessEndTime = Date.now();
      const jobLatency = jobSuccessEndTime - jobStartTime;

      const result = receipt.result;
      if (span) {
        span.end();
        span.setStatus({
          code: SpanStatusCode.OK,
          message: receipt.result.toString(),
        });
      }

      try {
        NodeMetrics.getInstance()?.jobSuccess();
        NodeMetrics.getInstance()?.recordSuccessfulJobLatency(jobLatency);
      } catch {}

      const ret: JobSuccess = {
        ...job,
        result: result,
      };
      return ret;
    } else {
      let isJupiterSwapError = false;
      let isHostnameDisabledError = false;
      if (receipt.error instanceof TaskError) {
        if (receipt.error.innerError instanceof HostnameDisabled) {
          isHostnameDisabledError = true;
        }
        if (
          receipt.error.innerError instanceof JupiterSwapError ||
          receipt.error.innerError instanceof JupiterSwapRateLimitExceeded
        ) {
          isJupiterSwapError = true;
        }
      } else if (receipt.error instanceof HostnameDisabled) {
        isHostnameDisabledError = true;
      } else if (
        receipt.error instanceof JupiterSwapError ||
        receipt.error instanceof JupiterSwapRateLimitExceeded
      ) {
        isJupiterSwapError = true;
      }

      const errorString = `${
        isJupiterSwapError || isHostnameDisabledError
          ? (receipt.error as Error).message
          : receipt.error instanceof Error
          ? receipt.error.toString()
          : typeof receipt.error === "string"
          ? receipt.error
          : typeof receipt.error === "object"
          ? JSON.stringify(receipt.error)
          : receipt.error
      }`;

      const e = `[Error] feed ${id} on job ${job.jobKey} [${
        job.weight ?? 1
      }]: ${errorString}\n${JSON.stringify(job.job.toJSON())}`;

      if (span) {
        span.end();
        span.setAttribute("error", e);
        span.setStatus({ code: SpanStatusCode.ERROR, message: e });
      }

      try {
        NodeMetrics.getInstance()?.jobFailure();
        NodeLogger.getInstance().error(e, id);
      } catch {}

      if (NodeEnvironment.getInstance().VERBOSE && isHostnameDisabledError) {
        console.error(receipt.error);
      }

      if (isJupiterSwapError) {
        try {
          NodeMetrics.getInstance()?.jupiterApiFailure();
        } catch {}
      }

      const ret: JobFailure = {
        ...job,
        error: e,
      };
      return ret;
    }
  }

  public async runJobs(
    jobs: Array<IJobDefinition>,
    aggregator: IAggregatorDefinition,
    timestamp: number = Math.floor(Date.now() / 1000)
  ): Promise<TaskRunnerResult> {
    const id =
      `${aggregator.name !== undefined ? "(" + aggregator.name + ") " : ""}${
        aggregator.address
      }` ?? "Unknown Feed";

    const allPromises = await Promise.allSettled(
      jobs.map(
        async (j: IJobDefinition): Promise<JobResult> =>
          // here we can add a timeout so job runtimes cannot exceed a given threshold
          await this.runJob(j, id)
      )
    );

    const allResults = allPromises.map((promise, i): JobResult => {
      if ("reason" in promise) {
        console.error(promise.reason);
        return {
          ...jobs[i],
          error: promise.reason,
        };
      }
      return promise.value;
    });

    // filter failed jobs, we already logged them

    const results: Array<JobSuccess> = allResults.filter(filterJobResults);
    const values: Array<Big> = results
      .map((r) => ("error" in r ? undefined : r.result))
      .filter((r): r is Big => r !== undefined);

    // check minJobs
    if (results.length === 0 || aggregator.minJobResults > results.length) {
      const e = `Error: Node did not aggregate a sufficient number of responses, needed ${aggregator.minJobResults}, received ${results.length}: ${id}`;
      NodeLogger.getInstance().warn(e, id);
      const errorType = classifyError(e);

      try {
        NodeMetrics.getInstance()?.jobAggregationFailure({
          ...DEFAULT_LABELS,
          feedName: id,
          error: errorType,
        });
      } catch {}

      // return with the error here
      return {
        feedName: id,
        jobs: allResults,
        error: e,
      };
    }

    // calculate the weighted median
    const median = BigUtils.weightedMedian(
      results.map((r, i) => {
        return { idx: i, value: r.result, weight: r.weight ?? 1 };
      })
    );

    // calculate and record variance among job results
    const sortedValues = values.sort((a, b) => a.minus(b).toNumber());
    const min = sortedValues[0];
    const max = sortedValues[sortedValues.length - 1];
    const jobVariance = max.minus(min);
    const jobVariancePercentage = max.gt(new Big(0))
      ? BigUtils.safeDiv(jobVariance, max).toNumber()
      : jobVariance.gt(0)
      ? 100
      : 0;
    if (aggregator.name) {
      try {
        NodeMetrics.getInstance()?.VarianceCache.set(
          aggregator.address,
          Math.max(
            NodeMetrics.getInstance()?.VarianceCache.get(aggregator.name) ?? 0,
            jobVariancePercentage
          )
        );
      } catch {}
    }

    // check varianceThreshold and determine if a value should be reported
    const roundStaleness = timestamp - aggregator.latestRoundTimestamp;
    // | [(V2 - V1)/V1] * 100 |
    const roundVariance = aggregator.latestRoundResult.eq(new Big(0))
      ? new Big(100) // 100% variance if latestRound is 0
      : BigUtils.safeDiv(
          median.minus(aggregator.latestRoundResult),
          aggregator.latestRoundResult
        )
          .mul(new Big(100))
          .abs();

    if (
      roundStaleness < aggregator.forceReportPeriod &&
      roundVariance.lt(aggregator.varianceThreshold)
    ) {
      const e = `Error: Skipping value report due to insufficient varianceThreshold [${aggregator.latestRoundResult.toNumber()} -> ${median.toNumber()}], required: ${aggregator.varianceThreshold
        .toNumber()
        .toFixed(2)}%, observed: ${roundVariance
        .toNumber()
        .toFixed(2)}% for feed ${id}`;
      NodeLogger.getInstance().warn(e, id);
      const result: TaskRunnerResult = {
        feedName: id,
        jobs: allResults,
        jobVariance: jobVariance,
        error: e,
        median: median,
        min: min,
        max: max,
        variance: roundVariance,
        staleness: roundStaleness,
      };
      return result;
    }

    const result: TaskRunnerResult = {
      feedName: id,
      jobs: allResults,
      jobVariance: jobVariance,
      median: median.round(16, 2 /** RoundingMode.RoundDown */),
      min: min.round(16, 2 /** RoundingMode.RoundDown */),
      max: max.round(16, 2 /** RoundingMode.RoundDown */),
      variance: roundVariance,
      staleness: roundStaleness,
    };
    return result;
  }
}

export const filterJobResults = (r: JobResult): r is JobSuccess =>
  !("error" in r);

export const taskRunnerSuccess = (
  r: TaskRunnerResult
): r is TaskRunnerSuccess => !("error" in r);

export type TaskRunnerResult = TaskRunnerSuccess | TaskRunnerFailure;

interface ITaskRunnerResult {
  jobVariance: Big;
  median: Big;
  min: Big;
  max: Big;
  variance: Big;
  staleness: number;
}

export interface TaskRunnerSuccess extends ITaskRunnerResult {
  feedName: string;
  jobs: Array<JobResult>;
}

export interface TaskRunnerFailure extends Partial<ITaskRunnerResult> {
  feedName: string;
  jobs: Array<JobResult>;
  error: string;
}

export interface IJobDefinition {
  jobKey: string;
  job: OracleJob;
  weight: number;
}
export interface IAggregatorDefinition {
  address: string;
  name: string | undefined;
  minJobResults: number;
  latestRoundResult: Big;
  latestRoundTimestamp: number;
  varianceThreshold: Big;
  forceReportPeriod: number;
}

export type JobResult = JobSuccess | JobFailure;

export interface JobFailure extends IJobDefinition {
  error: string;
}

export interface JobSuccess extends IJobDefinition {
  result: Big;
}

export function classifyError(error: any): string {
  const msg = error.toString();
  if (msg.includes("Transaction was not confirmed")) {
    return "TX_NOT_CONFIRMED";
  }
  if (msg.includes("failed to send transaction")) {
    return "TX_FAILED";
  }
  if (msg.includes("InstructionError")) {
    return "TX_RETURN_CODE_ERROR";
  }
  if (msg.includes("FetchError:")) {
    return "RPC_ENDPOINT_FAILURE";
  }
  if (msg.includes("blockhash")) {
    return "BLOCKHASH_NOT_FOUND";
  }
  return msg;
}
