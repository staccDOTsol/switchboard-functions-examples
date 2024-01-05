import { EVMEnvironment } from "../../../env/EVMEnvironment";
import type {
  SwitchboardTaskRunner,
  TaskRunnerResult,
} from "../../../modules/task-runner";
import {
  filterJobResults,
  taskRunnerSuccess,
} from "../../../modules/task-runner";
import { NodeTelemetry } from "../../../modules/telemetry";

import type { BatchSaveResult } from "./BatchSaveResult";

import { Big, toUtf8 } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";
import type { Job, OracleAccount, Switchboard } from "@switchboard-xyz/evm.js";
import {
  AggregatorAccount,
  fetchJobsFromIPFS,
  SBDecimal,
} from "@switchboard-xyz/evm.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import LRUCache from "lru-cache";

export interface AggregatorInfo {
  address: string;
  jobs: Job[];
  lastUpdatedAt: number;
  minUpdateDelaySeconds: number;
  balance: Big;
  minJobs: number;
  varianceThreshold: Big;
  forceReportPeriod: number;
  jobsHash: string;
  consecutiveFailures: number;
  lastFailureTimestamp: number;
}

export class UpdateSearch extends SwitchboardRoutine {
  eventName = "OpenRoundEvent";
  aggregators: AggregatorInfo[] = [];
  intervalCount: number = 0;

  queueAddress: string = "";
  jobCache = new LRUCache<string, OracleJob>({
    max: 10000,
  });
  successHandler = undefined;
  retryInterval = 0;
  errorHandler = async (error) => {
    NodeLogger.getInstance().error(`Failed to find updates, ${error}`);
  };

  constructor(
    readonly taskRunner: SwitchboardTaskRunner,
    readonly oracle: OracleAccount,
    readonly batchSaveResult: BatchSaveResult
  ) {
    super(15000);
  }

  async initialize(): Promise<void> {
    NodeLogger.getInstance().info(`Searching for aggregators...`);

    // get all aggregtors on the queue
    const results = await this.oracle.client.queryFilter(
      this.oracle.client.filters.AggregatorAccountInit(),
      0,
      "latest"
    );

    // get the oracle data with type info
    const oracleData = await this.oracle.client.oracles(this.oracle.address);

    // store queueAddress for later
    this.queueAddress = oracleData.queueAddress;

    // get all the aggregator info and filter out the ones that are not on the queue
    const aggregators = (
      await Promise.all(
        results.map(async (result) => {
          return fetchAggregatorInfo(
            this.oracle.client,
            result.args.accountAddress,
            oracleData.queueAddress // skips all the aggregators that are not on the queue
          );
        })
      )
    ).filter((r): r is AggregatorInfo => r !== undefined);
    this.aggregators = [...aggregators];

    NodeLogger.getInstance().info(
      `Found ${this.aggregators.length} aggregators. Starting routine...`
    );

    // add new aggregators to the list as they're created
    this.oracle.client.on(
      this.oracle.client.filters.AggregatorAccountInit(),
      async (aggregatorAddr) => {
        await fetchAggregatorInfo(
          this.oracle.client,
          aggregatorAddr,
          oracleData.queueAddress
        )
          .then((aggregator) => {
            if (aggregator) {
              this.aggregators.push(aggregator);
            }
          })
          .catch((e) => {
            this.errorHandler(e);
          });
      }
    );

    // keep aggregators up to date with their settings
    this.oracle.client.on(
      this.oracle.client.filters.AggregatorResponseSettingsUpdate(),
      async (
        aggregatorAddress,
        varianceThreshold,
        minJobResults,
        forceReportPeriod
      ) => {
        const aggregator = this.aggregators.filter(
          (a) => a.address === aggregatorAddress
        )[0];
        if (aggregator) {
          aggregator.varianceThreshold = new SBDecimal(
            varianceThreshold.toString(),
            18,
            false
          ).toBig();
          aggregator.minJobs = minJobResults.toNumber();
          aggregator.forceReportPeriod = forceReportPeriod.toNumber();
        }
      }
    );

    // addresss aggregators as they're funded, add to their balance
    this.oracle.client.on(
      this.oracle.client.filters.AggregatorFundEvent(),
      async (aggregatorAddr, funder, value) => {
        this.aggregators.filter(
          (a) => a.address === aggregatorAddr
        )[0].balance = this.aggregators
          .filter((a) => a.address === aggregatorAddr)[0]
          .balance.add(new Big(value.toString()));
      }
    );
  }

  async stop() {
    this.oracle.client.removeAllListeners(
      this.oracle.client.filters.AggregatorAccountInit()
    );
    this.oracle.client.removeAllListeners(
      this.oracle.client.filters.AggregatorFundEvent()
    );
    this.oracle.client.removeAllListeners(
      this.oracle.client.filters.AggregatorResponseSettingsUpdate()
    );
  }

  routine = async () => {
    // get all aggregtors on the queue
    const results = await this.oracle.client.queryFilter(
      this.oracle.client.filters.AggregatorAccountInit(),
      0,
      "latest"
    );

    const oracleData = await this.oracle.client.oracles(this.oracle.address);
    const queueData = await this.oracle.client.queues(oracleData.queueAddress);

    // store queueAddress for later
    this.queueAddress = oracleData.queueAddress;
    const reward = new Big(queueData.reward.toString());

    // go through each aggregator and see if it's ready to be updated
    for (const aggregator of this.aggregators) {
      // if the aggregator is ready to be updated
      if (aggregator.balance.lt(reward)) {
        continue;
      }

      // if the aggregator is ready to be updated
      if (
        aggregator.jobs.length === 0 ||
        aggregator.lastUpdatedAt + aggregator.minUpdateDelaySeconds >
          Date.now() / 1000 ||
        // if the aggregator has failed before and is ready to be updated
        (aggregator.consecutiveFailures > 0 &&
          !exponentialBackoff(
            aggregator.lastFailureTimestamp,
            aggregator.consecutiveFailures,
            aggregator.minUpdateDelaySeconds
          ))
      ) {
        NodeLogger.getInstance().info(
          `Aggregator ${aggregator.address} skipped - backing off.`
        );
        continue;
      }

      // call the callback
      try {
        NodeLogger.getInstance().info(
          `Aggregator ${aggregator.address} attempting save.`
        );
        await this.trySaveAggregator(aggregator);
      } catch (e) {
        this.errorHandler(e);
      }
    }

    // refetch the oracle data every 6 intervals (1 minute)
    if (this.intervalCount++ % 6 === 0) {
      // get all aggregtors on the queue
      const aggregators = (
        await Promise.all(
          results.map(async (result) => {
            return fetchAggregatorInfo(
              this.oracle.client,
              result.args.accountAddress,
              oracleData.queueAddress // skips all the aggregators that are not on the queue
            );
          })
        )
      ).filter((r): r is AggregatorInfo => r !== undefined);
      this.aggregators = [...aggregators]; // filter any nulls out
    }
  };

  async trySaveAggregator(aggregatorInfo: AggregatorInfo) {
    const {
      address: aggregatorAddress,
      forceReportPeriod,
      varianceThreshold,
      minJobs,
    } = aggregatorInfo;

    let jobsData = aggregatorInfo.jobs;

    this.newEvent();
    const aggregatorAccount = new AggregatorAccount(
      this.oracle.client,
      aggregatorAddress
    );

    const aggregator = await aggregatorAccount.client.aggregators(
      aggregatorAccount.address
    );

    if (aggregator.jobsHash !== aggregatorInfo.jobsHash) {
      const idx = this.aggregators.findIndex(
        (a) => a.address === aggregatorAddress
      );

      // if aggregator has been updated
      const aggregatorAccountInfo = await fetchAggregatorInfo(
        this.oracle.client,
        aggregatorAddress,
        this.queueAddress
      );
      if (aggregatorAccountInfo) {
        this.aggregators[idx] = aggregatorAccountInfo;
      }

      // overwrite the jobs data
      jobsData = this.aggregators[idx].jobs;
    }

    const jobs = jobsData.map(({ name, data, weight }, i) => {
      return {
        job: OracleJob.decodeDelimited(Buffer.from(data, "base64")),
        jobKey: name,
        weight: weight,
      };
    });

    NodeLogger.getInstance().info(
      `Resolving jobs for: ${aggregatorAddress}`,
      aggregatorAddress
    );

    // query the AggregatorSettingsUpdate event to get the latest settings

    const feedResult: TaskRunnerResult = await this.taskRunner.runJobs(jobs, {
      address: aggregatorAddress,
      name: toUtf8(aggregator.name),
      minJobResults: minJobs,
      latestRoundResult: new SBDecimal(
        aggregator.latestResult.value.toString(),
        18,
        aggregator.latestResult.value.isNegative()
      ).toBig(),
      latestRoundTimestamp: aggregator.latestResult.timestamp.toNumber(),
      varianceThreshold: new Big(varianceThreshold),
      forceReportPeriod: forceReportPeriod,
    });

    if (!taskRunnerSuccess(feedResult)) {
      // we already logged
      const aggIdx = this.aggregators.findIndex(
        (a) => a.address === aggregatorAddress
      );

      // increment the consecutive failures and return
      this.aggregators[aggIdx].consecutiveFailures++;
      this.aggregators[aggIdx].lastFailureTimestamp = Date.now();
      return;
    }

    NodeLogger.getInstance().info(
      `Responding to ${toUtf8(aggregator.name)} ${aggregatorAccount.address}: ${
        feedResult.median
      }; all: ${JSON.stringify(
        feedResult.jobs.filter(filterJobResults).map((r) => r.result)
      )}`,
      aggregatorAddress
    );

    /////////// SAVE RESULT DONE IN BATCH NOW ////////////////////////////
    this.batchSaveResult.send(
      aggregatorAccount.address.toString(),
      {
        aggregatorAddress: aggregatorAccount.address,
        value: SBDecimal.fromBig(feedResult.median),
      },
      async (name: string, signature: string) => {
        NodeLogger.getInstance().info(
          `Save Result Batched for ${aggregatorAccount.address}`,
          aggregatorAddress
        );

        NodeTelemetry.getInstance().sendFeedResult({
          environment: EVMEnvironment.getInstance(),
          aggregatorAddress: aggregatorAccount.address,
          oracleAddress: this.oracle.address,
          feedResult: feedResult,
          signature: signature,
        });

        // stall check
        this.newResponse();
      },
      async (error) =>
        NodeLogger.getInstance().error(error, aggregatorAccount.address)
    );
  }
}

export async function fetchAggregatorInfo(
  client: Switchboard,
  aggregatorAddress: string,
  queue?: string
) {
  try {
    const aggregatorAccount = new AggregatorAccount(client, aggregatorAddress);
    const aggregatorData = await aggregatorAccount.client.aggregators(
      aggregatorAccount.address
    );

    // if queue is passed in, check that the aggregator is in the queue
    if (aggregatorData.queueAddress !== queue) {
      return undefined;
    }

    const aggregatorSettingsUpdateEvents =
      await aggregatorAccount.client.queryFilter(
        aggregatorAccount.client.filters.AggregatorResponseSettingsUpdate(
          aggregatorAddress
        ),
        0,
        "latest"
      );

    if (aggregatorSettingsUpdateEvents.length === 0) {
      return undefined;
    }

    const { forceReportPeriod, varianceThreshold, minJobResults } =
      aggregatorSettingsUpdateEvents.pop()!.args;
    let aggregatorJobs: Job[] = [];

    try {
      aggregatorJobs = await fetchJobsFromIPFS(aggregatorData.jobsHash);
    } catch (e) {
      console.log(
        `No jobs found for aggregator: ${aggregatorAddress}, will be exponentially backed off until jobs are modified.`
      );
    }

    const aggregatorInfo: AggregatorInfo = {
      address: aggregatorAddress,
      jobs: aggregatorJobs,
      lastUpdatedAt: aggregatorData.latestResult.timestamp.toNumber(),
      minUpdateDelaySeconds: aggregatorData.minUpdateDelaySeconds.toNumber(),
      balance: new Big(aggregatorData.balance.toString()),
      minJobs: minJobResults.toNumber(),
      varianceThreshold: new SBDecimal(
        varianceThreshold.toString(),
        18,
        false
      ).toBig(),
      forceReportPeriod: forceReportPeriod.toNumber(),
      jobsHash: aggregatorData.jobsHash,
      consecutiveFailures: 0,
      lastFailureTimestamp: 0,
    };
    return aggregatorInfo;
  } catch (e) {
    NodeLogger.getInstance().error(`Error fetching aggregator info: ${e}`);
    return undefined;
  }
}

// check if the last input was more than the backoff time
function exponentialBackoff(
  lastInputTimestamp: number,
  failureCount: number,
  minUpdateDelaySeconds: number
) {
  const now = Date.now();
  const timeSinceLastInput = now - lastInputTimestamp;
  const backoff = Math.pow(2, failureCount) * minUpdateDelaySeconds;
  return timeSinceLastInput > backoff;
}
