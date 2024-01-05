import { NearEnvironment } from "../../../env/NearEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import type {
  IJobDefinition,
  SwitchboardTaskRunner,
  TaskRunnerResult,
} from "../../../modules/task-runner";
import {
  filterJobResults,
  taskRunnerSuccess,
} from "../../../modules/task-runner";
import { NodeTelemetry } from "../../../modules/telemetry";
import type { NearActionBatchQueue } from "../NearActionBatchQueue";

import { bs58, toUtf8 } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";
import type { NearEvent, OracleAccount, types } from "@switchboard-xyz/near.js";
import {
  AggregatorAccount,
  JobAccount,
  SwitchboardDecimal,
  toBase58,
  WebsocketEventListener,
} from "@switchboard-xyz/near.js";
import { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import LRUCache from "lru-cache";
import type { FinalExecutionOutcome } from "near-api-js/lib/providers";
import type { Action } from "near-api-js/lib/transaction";

export class OpenRoundEvent extends SwitchboardEventDispatcher {
  eventName = "OpenRoundEvent";

  actions: Action[] = [];
  timer: NodeJS.Timeout | undefined;
  sendPromise?: Promise<FinalExecutionOutcome>;
  interval = 250; // ms
  isActive: boolean = false;

  listener?: WebsocketEventListener;

  jobCache = new LRUCache<string, OracleJob>({
    max: 10000,
  });

  constructor(
    readonly taskRunner: SwitchboardTaskRunner,
    readonly queue: NearActionBatchQueue,
    readonly oracle: OracleAccount,
    readonly event?: NearEvent // if undefined, then use mainnet socket
  ) {
    super();
  }

  get program() {
    return this.oracle.program;
  }

  async start(): Promise<void> {
    if (!this.event && this.oracle.program.connection.networkId !== "mainnet") {
      throw new Error(`Need to provide NearEvent if networkId is not mainnet`);
    }

    NodeLogger.getInstance().info(`Watching event: ${this.eventName} ...`);
    const env = NearEnvironment.getInstance();

    if (
      this.oracle.program.connection.networkId === "mainnet" &&
      !env.MAINNET_NEAR_LAKE_LISTENER
    ) {
      this.listener = new WebsocketEventListener(
        toBase58(this.oracle.address),
        {
          AggregatorOpenRoundEvent: (event) => this.callback(event),
        },
        (error) =>
          NodeLogger.getInstance().error(
            `WebsocketEventListener Stalled, restarting ...`
          )
      );
      this.listener.start();
    } else {
      if (!this.event) {
        throw new Error(
          `Need to provide NearEvent if networkId is not mainnet`
        );
      }
      // awaiting this is blocking
      this.event
        .start(this.callback, (error) => {
          NodeLogger.getInstance().error(
            `NearEvent OpenRound listener failed: ${error}`
          );
          throw error;
        })
        .catch((e) => {
          NodeLogger.getInstance().error(
            `Near Oracle OpenRound event stalled, restarting ...`
          );
          this.start();
        });
    }
  }

  async stop(): Promise<void> {
    NodeLogger.getInstance().info(`Stopping Event ${this.eventName} ...`);
    this.isActive = false;
    // this.event.stop();
  }

  // TODO: Why does this crash the oracle when an error is thrown in the callback ???
  callback = async (event: types.AggregatorOpenRoundEventSerde) => {
    //// Validate Event
    try {
      // Check event belongs to this oracle
      const oracleIdx = event.oracles.findIndex((o) =>
        Buffer.from(new Uint8Array(o)).equals(this.oracle.address)
      );
      if (oracleIdx === -1) {
        return;
      }

      this.newEvent();

      // Load aggregator and jobs
      const aggregatorAccount = new AggregatorAccount({
        program: this.program,
        address: new Uint8Array(event.feed_key),
      });
      const aggregator = await aggregatorAccount.loadData();
      const base58Address = bs58.encode(aggregatorAccount.address);

      const logName = `${
        aggregator.name ? "(" + toUtf8(aggregator.name) + ") " : ""
      }${base58Address}`;

      NodeLogger.getInstance().info(
        `Event received! ${logName}, [${event.feed_key}]`
      );

      NodeLogger.getInstance().info(`Resolving jobs for: ${logName}`, logName);

      const jobs: Array<IJobDefinition> = await Promise.all(
        event.jobs.map(async (jobKey, i) => {
          const jobPubkey = toBase58(new Uint8Array([...jobKey]));
          let job: OracleJob;
          if (this.jobCache.has(jobPubkey)) {
            job = this.jobCache.get(jobPubkey)!;
          } else {
            const jobAccount = new JobAccount({
              program: this.oracle.program,
              address: new Uint8Array(jobKey),
            });
            const jobData = await jobAccount.loadData().catch((e) => {
              NodeLogger.getInstance().error(e);
              throw e;
            });
            job = OracleJob.decodeDelimited(jobData.data);
            this.jobCache.set(jobKey.toString(), job);
          }

          return {
            jobKey: jobPubkey,
            job,
            weight:
              i < aggregator.jobWeights.length && aggregator.jobWeights[i] > 0
                ? aggregator.jobWeights[i]
                : 1,
          };
        })
      );

      const feedResult: TaskRunnerResult = await this.taskRunner.runJobs(jobs, {
        address: toBase58(new Uint8Array([...event.feed_key])),
        name: toUtf8(aggregator.name),
        minJobResults: aggregator.minJobResults,
        latestRoundResult: aggregator.latestConfirmedRound.result.toBig(),
        latestRoundTimestamp:
          aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber(),
        varianceThreshold: aggregator.varianceThreshold.toBig(),
        forceReportPeriod: aggregator.forceReportPeriod.toNumber(),
      });

      if (!taskRunnerSuccess(feedResult)) {
        // we already logged
        return;
      }

      if (NearEnvironment.getInstance().LOCALNET) {
        try {
          NodeMetrics.getInstance()?.handleNewRound(
            /* address= */ aggregatorAccount.address.toString(),
            /* latestRoundOpenTimestamp= */ aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber(),
            /* feedResult= */ feedResult
          );
        } catch {}
      }

      NodeLogger.getInstance().info(
        `Responding to ${logName}: ${feedResult.median}; all: ${JSON.stringify(
          feedResult.jobs
            .filter(filterJobResults)
            .map((r) => r.result.toNumber())
        )}`
      );

      console.log(
        "\x1b[35m%s\x1b[0m",
        `${new Date().toUTCString()}: Task Runner finished, waiting to send ${logName}`
      );

      const jobsChecksum = new Uint8Array(
        JobAccount.produceJobsHash(jobs.map((j) => j.job)).digest()
      );

      const saveResultAction = aggregatorAccount.saveResultAction({
        oracleIdx,
        error: false,
        value: SwitchboardDecimal.fromBig(feedResult.median),
        jobsChecksum: jobsChecksum,
        minResponse: SwitchboardDecimal.fromBig(feedResult.min),
        maxResponse: SwitchboardDecimal.fromBig(feedResult.max),
      });

      const sig = this.queue.send(
        base58Address,
        logName,
        saveResultAction,
        async (name, receipt) => {
          NodeTelemetry.getInstance().sendFeedResult({
            environment: NearEnvironment.getInstance(),
            aggregatorAddress: toBase58(aggregatorAccount.address),
            oracleAddress: toBase58(this.oracle.address),
            feedResult: feedResult,
            signature: receipt.transaction_outcome.id,
          });
          return await saveResultCallback(name, receipt);
        },
        onFailureCallback
      );
      console.log(`${base58Address} : ${sig}`);

      // stall check
      this.newResponse();
    } catch (error) {
      NodeLogger.getInstance().error(
        `Near oracle failed to fulfill openRound: ${error}`
      );
    }
  };
}

async function saveResultCallback(
  name: string,
  txnReceipt: FinalExecutionOutcome
): Promise<void> {
  NodeLogger.getInstance().info(
    `Save Result Signature ${name}: ${txnReceipt.transaction.hash}`
  );

  console.log(
    "\x1b[32m%s\x1b[0m",
    `${new Date().toUTCString()}: Event finished ${name}: ${
      txnReceipt.transaction.hash
    }`
  );
}

async function onFailureCallback(
  name: string,
  txnReceipt: FinalExecutionOutcome
) {
  console.warn(
    "\x1b[31m%s\x1b[0m",
    `${new Date().toUTCString()}: Near oracle failed to fulfill openRound (${name})`
  );
}
