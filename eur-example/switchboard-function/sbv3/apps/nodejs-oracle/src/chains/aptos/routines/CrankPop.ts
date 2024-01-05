import { AptosEnvironment } from "../../../env/AptosEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import type {
  IJobDefinition,
  SwitchboardTaskRunner,
} from "../../../modules/task-runner";
import { taskRunnerSuccess } from "../../../modules/task-runner";
import { toLogName } from "../../../utils";

import type { CrankAccount, types } from "@switchboard-xyz/aptos.js";
import { AggregatorAccount, JobAccount } from "@switchboard-xyz/aptos.js";
import type { OracleJob } from "@switchboard-xyz/common";
import { promiseWithTimeout } from "@switchboard-xyz/common";
import { Big, toUtf8 } from "@switchboard-xyz/common";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { ConsoleLogger, NodeLogger } from "@switchboard-xyz/node/logging";
import type { AptosAccount, HexString } from "aptos";
import LRUCache from "lru-cache";

function unixTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function assertFulfilled<T>(
  item: PromiseSettledResult<T>
): item is PromiseFulfilledResult<T> {
  return item.status === "fulfilled";
}

interface CrankRowReady {
  address: string;
  name: string;
  idx: number;
  logName: string;
}

const CRANK_CACHE_SIZE = process.env.CRANK_CACHE_SIZE
  ? Number.parseInt(process.env.CRANK_CACHE_SIZE)
  : 100;

// CRANK_INTERVAL of 0 will lead to socket hang ups
const CRANK_INTERVAL =
  process.env?.CRANK_INTERVAL && +process.env?.CRANK_INTERVAL > 0
    ? Number.parseInt(process.env.CRANK_INTERVAL)
    : 500;

interface AptosAggregator {
  name: string;
  address: string;
  logName: string;
  varianceThreshold: Big;
  forceReportPeriod: number;
  jobKeys: Array<HexString>;
  jobWeights: Uint8Array;
  minJobResults: number;
  latestConfirmedRound: Big;
  latestConfirmedRoundTimestamp: number;
}

type AptosAggregatorWithIndex = AptosAggregator & { idx: number };

export class CrankPopRoutine extends SwitchboardRoutine {
  eventName = "AptosCrank";

  errorHandler = async (error?: any) => {
    NodeLogger.getInstance().log("Crank turn failed.");
    NodeLogger.getInstance().error((error as any).toString());
  };
  successHandler = undefined;
  retryInterval = undefined;

  // feedCache = new TTLCache<string, AptosAggregator>({
  //   max: CRANK_CACHE_SIZE,
  //   ttl: 10 * 1000,
  // });
  // varianceCache = new TTLCache<string, number>({
  //   max: CRANK_CACHE_SIZE,
  //   ttl: 10 * 1000,
  // });
  jobCache = new LRUCache<string, OracleJob>({
    max: CRANK_CACHE_SIZE * 10,
  });

  /** Tracks the last time a feed was popped so we only pop every 5s to prevent duplicates */
  // crankPopCache = new TTLCache<string, number>({
  //   max: CRANK_CACHE_SIZE,
  //   ttl: 5 * 1000,
  // });

  constructor(
    readonly crank: CrankAccount,
    readonly account: AptosAccount,
    readonly taskRunner: SwitchboardTaskRunner
  ) {
    super(CRANK_INTERVAL);
  }

  _crankRows: Array<types.CrankRow> = [];

  async getCrankRows(): Promise<[boolean, Array<types.CrankRow>]> {
    let hasUpdated = false;
    try {
      // wrap in a timeout, socket hang up can cause this to block event loop
      const crank = await promiseWithTimeout(
        5000,
        this.crank.loadData(),
        `Failed to fetch crank rows in ${5000} ms`
      );

      if (crank.heap.length !== this._crankRows.length) {
        hasUpdated = true;
      } else {
        for (const row of this._crankRows) {
          const newRow = crank.heap.find(
            (r) => r.aggregatorAddr.toString() === row.aggregatorAddr.toString()
          );
          if (newRow && !row.timestamp.eq(newRow.timestamp)) {
            hasUpdated = true;
            break;
          }
        }
      }

      // dont sort crank, we need the raw index to pop by
      this._crankRows = [...crank.heap];
    } catch (error) {
      NodeLogger.getInstance().error(
        `Failed to load the crank: ${error}`,
        this.eventName
      );
    }
    return [hasUpdated, this._crankRows];
  }

  async getFeed(address: string): Promise<AptosAggregator> {
    const aggregatorAccount = new AggregatorAccount(
      this.crank.client,
      address,
      this.crank.switchboardAddress
    );
    const aggregator = await promiseWithTimeout(
      5000,
      aggregatorAccount.loadData(),
      `Failed to fetch aggregator in ${5000} ms`
    );
    const feedName = toUtf8(aggregator.name) ?? "";
    const feedDefinition: AptosAggregator = {
      name: feedName,
      address: address,
      logName: toLogName(address, feedName),
      varianceThreshold: aggregator.varianceThreshold.toBig(),
      forceReportPeriod: aggregator.forceReportPeriod.toNumber(),
      jobKeys: aggregator.jobKeys,
      jobWeights: aggregator.jobWeights,
      minJobResults: aggregator.minJobResults.toNumber(),
      latestConfirmedRound: aggregator.latestConfirmedRound.result.toBig(),
      latestConfirmedRoundTimestamp:
        aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber(),
    };
    return feedDefinition;
    // this.feedCache.set(address, feedDefinition);
    // if (!this.feedCache.has(address)) {
    // }

    // return this.feedCache.get(address)!;
  }

  async pop(
    address: string,
    feedName: string,
    idx: number
  ): Promise<string | undefined> {
    const logName = toLogName(address, feedName);

    try {
      const sig = await this.crank.pop(this.account, idx);
      // this.crankPopCache.set(address, unixTimestamp());
      const message = `CrankPopSignature for feed ${logName}: ${sig}`;
      NodeLogger.getInstance().info(message, logName);
      if (AptosEnvironment.getInstance().DEBUG) {
        ConsoleLogger.green(`${new Date().toUTCString()}: ${message}`);
      }

      try {
        // set last crank pop if metrics are enabled
        NodeMetrics.setLastCrankPop();
      } catch {}

      return sig;
    } catch (error) {
      const message = `CrankPop failed ${logName}: ${
        error instanceof Error ? error.message : error
      }`;
      NodeLogger.getInstance().error(message, logName);
      if (AptosEnvironment.getInstance().DEBUG) {
        ConsoleLogger.red(`${new Date().toUTCString()}: ${message}`);
      }

      return undefined;
    }
  }

  /**
   * This function will take an array of aggregators with their definitions and
   * return an array of all of the aggregators that are ready to be popped based on their
   * forceReportPeriod, varianceThreshold, and current task runner result
   * */
  async getReadyFeeds(
    feeds: Array<AptosAggregatorWithIndex>
  ): Promise<Array<CrankRowReady>> {
    const now = unixTimestamp();

    const promises = feeds.map(
      async (aggregator): Promise<CrankRowReady | undefined> => {
        try {
          const aggregatorStaleness =
            now - aggregator.latestConfirmedRoundTimestamp;
          // skip checking the feeds variance if any of the following conditions are true
          // - DISABLE_SMART_CRANK is set to true
          // - varianceThreshold = 0
          // - forceReportPeriod = 0
          // - aggregators latestConfirmedRound age exceeds forceReportPeriod
          if (
            AptosEnvironment.getInstance().DISABLE_SMART_CRANK ||
            aggregator.varianceThreshold.eq(new Big(0)) ||
            aggregator.forceReportPeriod === 0 ||
            aggregatorStaleness > aggregator.forceReportPeriod
          ) {
            return {
              address: aggregator.address,
              name: aggregator.name,
              logName: aggregator.logName,
              idx: aggregator.idx,
            };
          }

          // TODO: Check if a feed was recently popped successfully,
          // no point popping again if its really not ready yet and rpc is stale

          const jobDefs: Array<IJobDefinition> = await Promise.all(
            aggregator.jobKeys.map(async (jobKey, i) => {
              let job: OracleJob;
              if (this.jobCache.has(jobKey.toString())) {
                job = this.jobCache.get(jobKey.toString())!;
              } else {
                const jobAccount = new JobAccount(
                  this.crank.client,
                  jobKey,
                  this.crank.switchboardAddress
                );
                job = await jobAccount.loadJob().catch((e) => {
                  NodeLogger.getInstance().error(e);
                  throw e;
                });
                this.jobCache.set(jobKey.toString(), job);
              }

              return {
                jobKey: jobKey.toString(),
                job,
                weight:
                  i < aggregator.jobWeights.length &&
                  aggregator.jobWeights[i] > 0
                    ? aggregator.jobWeights[i]
                    : 1,
              };
            })
          );

          // TODO: Check if feed is in the varianceCache, no point checking every run

          const feedResult = await this.taskRunner.runJobs(jobDefs, {
            address: aggregator.address,
            name: aggregator.name,
            minJobResults: aggregator.minJobResults,
            latestRoundResult: aggregator.latestConfirmedRound,
            latestRoundTimestamp: aggregator.latestConfirmedRoundTimestamp,
            varianceThreshold: aggregator.varianceThreshold,
            forceReportPeriod: aggregator.forceReportPeriod,
          });

          if (taskRunnerSuccess(feedResult)) {
            return {
              address: aggregator.address,
              name: aggregator.name,
              logName: aggregator.logName,
              idx: aggregator.idx,
            };
          }
        } catch (error) {
          NodeLogger.getInstance().error(
            `Failed to build CrankPop transaction, ${error}`,
            aggregator.logName
          );
        }

        return undefined;
      }
    );

    const readyPops: Array<CrankRowReady> = (await Promise.allSettled(promises))
      .filter(assertFulfilled) // remove any rejected promises
      .map((p) => p.value)
      .filter((a): a is CrankRowReady => Boolean(a))
      .sort((a, b) => (a.idx >= b.idx ? -1 : 1)); // want to pop in reverse order

    return readyPops;
  }

  routine = async () => {
    try {
      const [hasUpdated, crankRows] = await this.getCrankRows();
      if (crankRows.length === 0) {
        NodeLogger.getInstance().warn(`Crank is empty`);
        // should we exit?
        return;
      }

      if (hasUpdated) {
        // stall check, record every time the crank moves
        this.newEvent();
      }

      const now = unixTimestamp();

      // Fetch all aggregators that are ready at the same time
      const allReadyFeeds: Array<AptosAggregatorWithIndex> = (
        await Promise.allSettled(
          crankRows.map(
            async (row, i): Promise<AptosAggregatorWithIndex | undefined> => {
              if (row.timestamp.toNumber() > now) {
                return undefined;
              }
              const address = row.aggregatorAddr.toString();
              const aggregator = await this.getFeed(address);
              return {
                ...aggregator,
                idx: i,
              };
            }
          )
        )
      )
        .filter(assertFulfilled) // filter rejected promises
        .map((a): AptosAggregatorWithIndex | undefined => a.value)
        .filter((r): r is AptosAggregatorWithIndex => r !== undefined);

      // check all feeds variance against the current task runner result
      const readyFeeds = await this.getReadyFeeds(allReadyFeeds);

      if (readyFeeds.length === 0) {
        return;
      }

      let numSuccess = 0;

      for await (const feed of readyFeeds) {
        let idx = feed.idx;

        // fetch another copy of the crank rows, things may have shifted in between the last fetch and now
        try {
          // we dont want to call getCrankRows because that will set the internal state and break our hasUpdated check
          const crankData = await promiseWithTimeout(
            5000,
            this.crank.loadData(),
            `Failed to fetch crank rows in ${5000} ms`
          );
          const newIdx = crankData.heap.findIndex(
            (row) => row.aggregatorAddr.toString() === feed.address
          );
          if (newIdx !== -1) {
            idx = newIdx;
          }
        } catch {}

        try {
          if (idx === -1) {
            NodeLogger.getInstance().error(
              `Failed to find aggregators position on the crank, ${feed.logName}`,
              feed.logName
            );
            continue;
          }
          const sig = await this.pop(feed.address, feed.name, idx);

          if (sig) {
            numSuccess = numSuccess + 1;
            // stall check, record last successful crank pop txn
            this.newResponse();
          }
        } catch {}
      }

      NodeLogger.getInstance().log(
        `Successfully popped ${numSuccess} / ${readyFeeds.length}`
      );
    } catch (error) {
      NodeLogger.getInstance().error(`Aptos crank routine failed: ${error}`);
    }
  };
}
