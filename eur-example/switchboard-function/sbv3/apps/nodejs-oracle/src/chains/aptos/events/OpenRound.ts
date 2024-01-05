import { AptosEnvironment } from "../../../env/AptosEnvironment";
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
import type { BatchSaveResult } from "../routines/BatchSaveResult";

import type { OracleAccount } from "@switchboard-xyz/aptos.js";
import {
  AggregatorAccount,
  AptosDecimal,
  AptosEvent,
  JobAccount,
} from "@switchboard-xyz/aptos.js";
import type { OracleJob } from "@switchboard-xyz/common";
import { toUtf8 } from "@switchboard-xyz/common";
import { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { AptosAccount } from "aptos";
import { HexString } from "aptos";
import LRUCache from "lru-cache";

interface IAptosOpenRoundEvent {
  aggregator_address: HexString;
  job_keys: HexString[];
  oracle_keys: HexString[];
}

export class OpenRoundEvent extends SwitchboardEventDispatcher {
  eventName = "OpenRoundEvent";

  event: AptosEvent;

  jobCache = new LRUCache<string, OracleJob>({
    max: 10000,
  });

  constructor(
    readonly taskRunner: SwitchboardTaskRunner,
    readonly oracle: OracleAccount,
    readonly account: AptosAccount,
    readonly batchSaveResult: BatchSaveResult
  ) {
    super();
    const env = AptosEnvironment.getInstance();
    this.event = new AptosEvent(
      this.oracle.client,
      env.APTOS_PID,
      `${HexString.ensure(env.APTOS_PID).hex()}::switchboard::State`,
      "aggregator_open_round_events"
    );
  }

  async start(): Promise<void> {
    NodeLogger.getInstance().info(`Watching event: ${this.eventName} ...`);

    this.event.onTrigger(this.callback, (error) => {
      NodeLogger.getInstance().info(
        `AptosEvent error: ${error instanceof Error ? error.stack : error}`
      );
    });
  }

  async stop(): Promise<void> {
    NodeLogger.getInstance().info(`Stopping Event ${this.eventName} ...`);
    this.event.stop();
  }

  callback = async (event: any) => {
    const eventData: IAptosOpenRoundEvent = event.data;
    // Check event belongs to this oracle
    const oracleIdx = eventData.oracle_keys.findIndex(
      (v) => this.oracle.address.toString() === v.toString()
    );
    if (oracleIdx === -1) {
      return;
    }

    this.newEvent();
    NodeLogger.getInstance().info(
      `Event received! Aggregator = ${
        eventData.aggregator_address
      }, Oracle(s) = ${eventData.oracle_keys
        .map((key) => key.toString())
        .join("\n")}`,
      eventData.aggregator_address.toString()
    );
    const aggregatorAccount = new AggregatorAccount(
      this.oracle.client,
      eventData.aggregator_address,
      this.oracle.switchboardAddress
    );
    const aggregator = await aggregatorAccount.loadData();

    NodeLogger.getInstance().info(
      `Resolving jobs for: ${eventData.aggregator_address}`,
      eventData.aggregator_address.toString()
    );

    const jobs: Array<IJobDefinition> = await Promise.all(
      eventData.job_keys.map(async (jobKey, i) => {
        let job: OracleJob;
        if (this.jobCache.has(jobKey.toString())) {
          job = this.jobCache.get(jobKey.toString())!;
        } else {
          const jobAccount = new JobAccount(
            this.oracle.client,
            jobKey,
            this.oracle.switchboardAddress
          );
          job = await jobAccount.loadJob().catch((e) => {
            NodeLogger.getInstance().error(
              e,
              eventData.aggregator_address.toString()
            );
            throw e;
          });
          this.jobCache.set(jobKey.toString(), job);
        }

        return {
          jobKey: jobKey.toString(),
          job,
          weight:
            i < aggregator.jobWeights.length && aggregator.jobWeights[i] > 0
              ? aggregator.jobWeights[i]
              : 1,
        };
      })
    );

    const feedResult: TaskRunnerResult = await this.taskRunner.runJobs(jobs, {
      address: eventData.aggregator_address.toString(),
      name: toUtf8(aggregator.name),
      minJobResults: aggregator.minJobResults.toNumber(),
      latestRoundResult: new AptosDecimal(
        aggregator.latestConfirmedRound.result.value.toString(),
        aggregator.latestConfirmedRound.result.dec,
        aggregator.latestConfirmedRound.result.neg
      ).toBig(),
      latestRoundTimestamp:
        aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber(),
      varianceThreshold: new AptosDecimal(
        aggregator.varianceThreshold.value.toString(),
        aggregator.varianceThreshold.dec,
        aggregator.varianceThreshold.neg
      ).toBig(),
      forceReportPeriod: aggregator.forceReportPeriod.toNumber(),
    });

    if (!taskRunnerSuccess(feedResult)) {
      // we already logged
      return;
    }

    if (!AptosEnvironment.getInstance().LOCALNET) {
      try {
        NodeMetrics.getInstance()?.handleNewRound(
          /* address= */ aggregatorAccount.address.toString(),
          /* latestRoundOpenTimestamp= */ aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber(),
          /* feedResult= */ feedResult
        );
      } catch {}
    }

    NodeLogger.getInstance().info(
      `Responding to ${toUtf8(aggregator.name)} ${aggregatorAccount.address}: ${
        feedResult.median
      }; all: ${JSON.stringify(
        feedResult.jobs.filter(filterJobResults).map((r) => r.result)
      )}`,
      eventData.aggregator_address.toString()
    );

    // const jobsChecksumHash = produceJobsHash(jobs.map((i) => i[1]));
    // const jobsChecksum = Buffer.from(jobsChecksumHash.digest());

    /////////// SAVE RESULT DONE IN BATCH NOW ////////////////////////////
    this.batchSaveResult.send(
      aggregatorAccount.address.toString(),
      {
        aggregatorAddress: aggregatorAccount.address,
        oracleAddress: this.oracle.address,
        oracleIdx: oracleIdx,
        error: false,
        value: feedResult.median,
        jobsChecksum: Buffer.from(aggregator.jobsChecksum).toString("hex"),
        minResponse: feedResult.min,
        maxResponse: feedResult.max,
      },
      async (name: string, signature: string) => {
        NodeLogger.getInstance().info(
          `Save Result Batched for ${aggregatorAccount.address}`,
          eventData.aggregator_address.toString()
        );
        NodeTelemetry.getInstance().sendFeedResult({
          environment: AptosEnvironment.getInstance(),
          aggregatorAddress: aggregatorAccount.address.toString(),
          oracleAddress: this.oracle.address.toString(),
          feedResult: feedResult,
          signature: signature,
        });

        // stall check
        this.newResponse();
      },
      async (error) =>
        NodeLogger.getInstance().error(
          error,
          aggregatorAccount.address.toString()
        )
    );
  };
}
