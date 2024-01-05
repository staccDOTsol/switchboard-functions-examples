import type {
  ChainlinkClient,
  JupiterSwap,
  MangoPerps,
  MercurialSwap,
  OrcaExchange,
  PortClient,
  PythClient,
  RaydiumExchange,
  SaberSwap,
  SerumSwap,
  SwitchboardClient,
} from "../clients/index.js";

import type { IJobContext } from "./JobContext.js";
import type { TaskReceipt } from "./TaskReceipt.js";
import type { ITaskResult, TaskResult } from "./TaskResult.js";
import type { Websocket } from "./Websocket.js";

import type { Idl } from "@coral-xyz/anchor";
import type { Marinade } from "@marinade.finance/marinade-ts-sdk";
import type { Connection } from "@solana/web3.js";
import type { Big, OracleJob } from "@switchboard-xyz/common";
import type { RateObserver } from "@switchboard-xyz/defi-yield-ts";
import type { SwitchboardProgram } from "@switchboard-xyz/solana.js";

export type ITaskType = NonNullable<keyof OracleJob.ITask>;
export type IOracleTasks = NonNullable<OracleJob.ITask[keyof OracleJob.ITask]>;

export type RunTask = (
  task: OracleJob.ITask,
  input?: string
) => Promise<{
  result: string;
  numericResult: boolean;
  taskType: ITaskType;
  input: string;
}>;
export type PerformJob = (
  jobKey: string,
  job: OracleJob,
  ctx?: IJobContext
) => Promise<TaskRunnerReceipt>;
export type PerformBuffer = (
  jobKey: string,
  job: OracleJob,
  ctx?: IJobContext
) => Promise<TaskRunnerReceipt<Buffer>>;

// ensures we cover each task type
export type ITask = {
  run: (
    ctx: IJobContext,
    iTask: OracleJob.ITask
  ) => Promise<TaskResult> | TaskResult;
} & {
  [Property in keyof OracleJob.ITask]-?: (
    ctx: IJobContext,
    iTask: NonNullable<OracleJob.ITask[Property]>
  ) => Promise<ITaskResult> | ITaskResult;
};

/** Each task gets a receipt based on its execution context */

export interface TaskRunnerReceiptParams {
  id: string;
  tasks: Array<OracleJob.ITask>;
  results: Array<TaskReceipt>;
}

export type TaskRunnerSuccessReceipt<T = Big> = TaskRunnerReceiptParams & {
  result: T;
};

export type TaskRunnerFailureReceipt = TaskRunnerReceiptParams & {
  error: unknown;
  errorTask: OracleJob.ITask;
  errorTaskIndex: number;
};

export type TaskRunnerReceipt<T = Big> =
  | TaskRunnerSuccessReceipt<T>
  | TaskRunnerFailureReceipt;

export const receiptSuccess = (
  r: TaskRunnerReceipt
): r is TaskRunnerSuccessReceipt => !("error" in r);

/** Each OracleJob.ITask must return a Big.js or a string */

export interface ITaskRunnerLogger {
  log(level: string, message: string, id?: string): void;
  debug(message: string, id?: string): void;
  info(message: string, id?: string): void;
  warn(message: string, id?: string): void;
  error(message: string, id?: string): void;
}

export interface ICacheSetOptions {
  /**
   * Do not call dispose() function when overwriting a key with a new value
   * Overrides the value set in the constructor.
   */
  noDisposeOnSet?: boolean;

  /**
   * Do not update the TTL when overwriting an existing item.
   */
  noUpdateTTL?: boolean;

  /**
   * Override the default TTL for this one set() operation.
   * Required if a TTL was not set in the constructor options.
   */
  ttl?: number;
}

export interface ITaskRunnerCache {
  logger: ITaskRunnerLogger;
  // Socket Cache
  getOrCreateSocket(wsTask: OracleJob.IWebsocketTask, ttl?: number): Websocket;
  getSocket(wsTask: OracleJob.IWebsocketTask): Websocket | undefined;
  hasSocket(wsTask: OracleJob.IWebsocketTask): boolean;
  setSocket(
    wsTask: OracleJob.IWebsocketTask,
    websocket: Websocket,
    options?: ICacheSetOptions
  ): void;
  delSocket(wsTask: OracleJob.IWebsocketTask): void;

  // Http Response Cache
  getHttpResponse(httpTask: OracleJob.IHttpTask): string | undefined;
  hasHttpResponse(httpTask: OracleJob.IHttpTask): boolean;
  setHttpResponse(
    httpTask: OracleJob.IHttpTask,
    response: string,
    options: ICacheSetOptions
  ): void;
  delHttpResponse(httpTask: OracleJob.IHttpTask): void;

  // Anchor IDL
  getAnchorIdl(programId: string): Idl | undefined;
  hasAnchorIdl(programId: string): boolean;
  setAnchorIdl(programId: string, idl: Idl, options: ICacheSetOptions): void;
  delAnchorIdl(programId: string): void;
}

export interface ITaskRunner {
  program: SwitchboardProgram;
  solanaMainnetConnection: Connection;

  logger: ITaskRunnerLogger;
  cache: ITaskRunnerCache;
  clients: ITaskRunnerClients;
  configs: Map<string, any>;

  runTask: RunTask;

  /**
   * Computes a JobResult given an OracleJob to run.
   * @param [jobKey] ID associated with the job for easier identification.
   * @param [job] The OracleJob that should be run.
   * @param [ctx] Optional, an existing job context to attach to the job for sharing cache and the current running result.
   * @throws {String}
   * @returns {Promise<TaskSimulatorReceipt>}
   */
  perform: PerformJob;
  /**
   * Computes a JobResult given an OracleJob to run and return a buffer.
   * @param [jobKey] ID associated with the job for easier identification.
   * @param [job] The OracleJob that should be run.
   * @param [ctx] Optional, an existing job context to attach to the job for sharing cache and the current running result.
   * @throws {String}
   * @returns {Promise<TaskRunnerReceipt<Buffer>>}
   */
  performAsBuffer: PerformBuffer;
}

export interface ITaskRunnerClients {
  load(...args: any[]): Promise<void>;
  program: SwitchboardProgram;
  solanaMainnetConnection: Connection;
  switchboard: SwitchboardClient;
  saber: SaberSwap;
  orca: OrcaExchange;
  serum: SerumSwap;
  raydium: RaydiumExchange;
  mercurial: MercurialSwap;
  lendingRateObserver: RateObserver;
  mango: MangoPerps;
  jupiter: JupiterSwap;
  pyth: PythClient;
  chainlink: ChainlinkClient;
  marinade: Marinade;
  port: PortClient;
}
