import { NearEnvironment } from "../../../env/NearEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import type {
  IJobDefinition,
  SwitchboardTaskRunner,
  TaskRunnerResult,
} from "../../../modules/task-runner";
import { taskRunnerSuccess } from "../../../modules/task-runner";
import { toLogName } from "../../../utils";
import type { NearAccessKeyQueue } from "../NearAccessKey";

import type { BN } from "@switchboard-xyz/common";
import { Big, promiseWithTimeout } from "@switchboard-xyz/common";
import { buf2String } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";
import type { CrankAccount, EscrowAccount } from "@switchboard-xyz/near.js";
import {
  AggregatorAccount,
  handleReceipt,
  JobAccount,
  parseAddressString,
  toBase58,
  types,
} from "@switchboard-xyz/near.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import LRUCache from "lru-cache";
import type { KeyPair } from "near-api-js";
import type { FinalExecutionOutcome } from "near-api-js/lib/providers";

function unixTimestamp() {
  return Math.floor(Date.now() / 1000);
}

interface CrankRowReady {
  address: string;
  nextTimestamp: BN;
  name: string;
  idx: number;
  logName: string;
}

// CRANK_INTERVAL of 0 will lead to socket hang ups
const CRANK_INTERVAL =
  process.env.CRANK_INTERVAL && +process.env.CRANK_INTERVAL > 0
    ? Number.parseInt(process.env.CRANK_INTERVAL)
    : 500;

const CRANK_CACHE_SIZE = process.env.CRANK_CACHE_SIZE
  ? Number.parseInt(process.env.CRANK_CACHE_SIZE)
  : 1000;

export class CrankPopRoutine extends SwitchboardRoutine {
  eventName = "NearCrank";

  errorHandler = async (error?: any) => {
    NodeLogger.getInstance().error((error as any).toString());
  };
  successHandler = undefined;
  retryInterval = CRANK_INTERVAL * 1000;

  /** Only want to fetch the on-chain state every few seconds. A better implementation would watch for AggregatorUpdateEvents */
  // feedCache = new TTLCache<string, types.AggregatorView>({
  //   max: CRANK_CACHE_SIZE,
  //   ttl: 10 * 1000,
  // });

  /** Tracks how often variance was calculated on a given feed */
  // varianceCache = new TTLCache<string, number>({
  //   max: CRANK_CACHE_SIZE,
  //   ttl: 10 * 1000,
  // });

  /** Prevent redundant fetches for immutable data */
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
    readonly escrow: EscrowAccount,
    readonly keypair: KeyPair,
    readonly queue: NearAccessKeyQueue,
    readonly taskRunner?: SwitchboardTaskRunner
  ) {
    super(CRANK_INTERVAL);
    logger.disableLogger();
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

      if (crank.data.length !== this._crankRows.length) {
        hasUpdated = true;
      } else {
        for (const row of this._crankRows) {
          const newRow = crank.data.find(
            (r) => r.uuid.toString() === row.uuid.toString()
          );
          if (newRow && !row.nextTimestamp.eq(newRow.nextTimestamp)) {
            hasUpdated = true;
            break;
          }
        }
      }

      // dont sort crank, we need the raw index to pop by
      this._crankRows = [...crank.data];
    } catch (error) {
      NodeLogger.getInstance().error(
        `Failed to load the crank: ${error}`,
        this.eventName
      );
    }
    return [hasUpdated, this._crankRows];
  }

  async getFeed(address: string): Promise<types.AggregatorView> {
    // if (this.feedCache.getRemainingTTL(address)) {
    //   const feed = this.feedCache.get(address);
    //   if (feed) {
    //     return feed;
    //   }
    // }

    const aggregatorAccount = new AggregatorAccount({
      program: this.crank.program,
      address: parseAddressString(address),
    });
    const aggregator = await aggregatorAccount.loadData();
    // this.feedCache.set(address, aggregator);
    return aggregator;
  }

  async pop(
    address: string,
    logName: string,
    idx: number
  ): Promise<FinalExecutionOutcome | undefined> {
    // NEAR is annoying with logging txn Receipt on failures. We may need to temporarily disable the console here (or everywhere)
    try {
      const popAction = this.crank.popAction({
        rewardRecipient: this.escrow.address,
        popIdx: idx,
      });

      const txnReceipt = await this.queue.send(popAction);
      const result = handleReceipt(txnReceipt);
      if (result instanceof types.SwitchboardError) {
        throw result;
      }
      // this.crankPopCache.set(address, unixTimestamp());
      if (NearEnvironment.VERBOSE()) {
        console.log(
          "\x1b[32m%s\x1b[0m",
          `${new Date().toUTCString()}: CrankPop ${logName}: ${
            txnReceipt.transaction.hash
          }`
        );
      }

      try {
        NodeMetrics.setLastCrankPop();
      } catch {}

      return txnReceipt;
    } catch (error) {
      if (!(error instanceof types.SwitchboardError)) {
        NodeLogger.getInstance().error((error as any).toString(), logName);
      }

      if (NearEnvironment.VERBOSE()) {
        console.log(
          "\x1b[31m%s\x1b[0m",
          `${new Date().toUTCString()}: CrankPop failed ${logName}: ${error}`
        );
      }

      return undefined;
    }
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
        this.newEvent();
      }

      const crankPopPromises: Array<Promise<CrankRowReady | undefined>> = [];

      const now = unixTimestamp();

      for await (const [i, row] of crankRows.entries()) {
        if (row.nextTimestamp.toNumber() > now) {
          continue;
        }

        const address = toBase58(row.uuid);

        // Have we popped this feed in the last 5 seconds?
        // if (this.crankPopCache.getRemainingTTL(address)) {
        //   continue;
        // }

        // We might want to fetch the fresh state every time and check if a new round was recently opened to give oracles enough time to respond
        const aggregator = await this.getFeed(address);
        const feedName = buf2String(aggregator.name) ?? "";
        const logName = toLogName(address, feedName);

        // skip checking the feeds variance if any of the following conditions are true
        // - DISABLE_SMART_CRANK is set to true
        // - varianceThreshold = 0
        // - forceReportPeriod = 0
        // - aggregators latestConfirmedRound age exceeds forceReportPeriod
        if (
          NearEnvironment.getInstance().DISABLE_SMART_CRANK ||
          aggregator.varianceThreshold.toBig().eq(new Big(0)) ||
          aggregator.forceReportPeriod.toNumber() === 0 ||
          now - aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber() >
            aggregator.forceReportPeriod.toNumber()
        ) {
          crankPopPromises.push(
            Promise.resolve({
              address,
              name: feedName,
              logName,
              idx: i,
              nextTimestamp: row.nextTimestamp,
            })
          );
          continue;
        }

        // Have we checked this feeds variance in the last 10 seconds?
        // if (this.varianceCache.getRemainingTTL(address)) {
        //   continue;
        // }

        const crankPopPromise: Promise<CrankRowReady | undefined> = Promise.all(
          aggregator.jobs.map(async (jobKey, i) => {
            const jobPubkey = toBase58(jobKey);
            let job: OracleJob;
            if (this.jobCache.has(jobPubkey)) {
              job = this.jobCache.get(jobPubkey)!;
            } else {
              const jobAccount = new JobAccount({
                program: this.crank.program,
                address: jobKey,
              });
              const jobData = await jobAccount.loadData().catch((e) => {
                NodeLogger.getInstance().error(e);
                throw e;
              });
              job = OracleJob.decodeDelimited(jobData.data);
              this.jobCache.set(jobPubkey, job);
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
        )
          .then((jobs: Array<IJobDefinition>): Promise<TaskRunnerResult> => {
            return this.taskRunner!.runJobs(jobs, {
              address: address,
              name: feedName,
              minJobResults: aggregator.minJobResults,
              latestRoundResult: aggregator.latestConfirmedRound.result.toBig(),
              latestRoundTimestamp:
                aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber(),
              varianceThreshold: aggregator.varianceThreshold.toBig(),
              forceReportPeriod: aggregator.forceReportPeriod.toNumber(),
            });
          })
          .then((feedResult): CrankRowReady | undefined => {
            if (taskRunnerSuccess(feedResult)) {
              return {
                address,
                name: feedName,
                logName,
                idx: i,
                nextTimestamp: row.nextTimestamp,
              };
            }

            // this.varianceCache.set(address, unixTimestamp());

            return undefined;
          })
          .catch((error) => {
            NodeLogger.getInstance().error(
              `Failed to build CrankPop transaction, ${error}`,
              logName
            );
            return undefined;
          });

        if (crankPopPromise) {
          crankPopPromises.push(crankPopPromise);
        }
      }

      const readyRows = (await Promise.allSettled(crankPopPromises))
        .map((p) => {
          if (p.status === "fulfilled" && p.value && p.value) {
            return p.value;
          }
          return undefined;
        })
        .filter((r): r is CrankRowReady => r !== undefined);

      const poppedReceipts: Array<FinalExecutionOutcome> = [];

      for (const row of readyRows.sort((a, b) =>
        a.nextTimestamp.cmp(b.nextTimestamp)
      )) {
        try {
          const txnReceipt = await this.pop(row.address, row.logName, row.idx);
          if (txnReceipt) {
            poppedReceipts.push(txnReceipt);

            // stall check
            this.newResponse();

            if (NearEnvironment.VERBOSE()) {
              NodeLogger.getInstance().info(
                `CrankPop signature: ${txnReceipt?.transaction.hash}`,
                row.logName
              );
            }
          }
        } catch {}
      }
    } catch (error) {
      NodeLogger.getInstance().error(`Near crank routine failed: ${error}`);
    }
  };
}

const logger = (function () {
  let oldConsoleLog: any | null = null;
  let oldConsoleInfo: any | null = null;
  let oldConsoleWarn: any | null = null;
  let oldConsoleError: any | null = null;
  const pub = {
    // enableLogger: function enableLogger() {
    //   if (oldConsoleError == null) return;
    //   global["console"]["error"] = oldConsoleError;
    // },
    disableLogger: function disableLogger() {
      oldConsoleLog = console.log;
      oldConsoleInfo = console.info;
      oldConsoleWarn = console.warn;
      oldConsoleError = console.error;
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      global["console"]["log"] = function () {};
      global["console"]["info"] = function () {};
      global["console"]["warn"] = function () {};
      global["console"]["error"] = function () {};
    },
  };
  return pub;
})();
