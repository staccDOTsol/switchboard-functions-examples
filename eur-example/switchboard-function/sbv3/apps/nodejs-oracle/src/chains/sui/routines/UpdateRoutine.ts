import { SuiEnvironment } from "../../../env/SuiEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import type {
  SwitchboardTaskRunner,
  TaskRunnerResult,
} from "../../../modules/task-runner";
import {
  filterJobResults,
  taskRunnerSuccess,
} from "../../../modules/task-runner";
import { NodeTelemetry } from "../../../modules/telemetry";

import type { Keypair, SuiEvent as EventEnvelope } from "@mysten/sui.js";
import { RawSigner, TransactionBlock } from "@mysten/sui.js";
import type { OracleJob } from "@switchboard-xyz/common";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type {
  OracleAccount,
  OracleQueueAccount,
} from "@switchboard-xyz/sui.js";
import {
  AggregatorAccount,
  getTableData,
  sendSuiTx,
  SuiDecimal,
  SuiEvent,
} from "@switchboard-xyz/sui.js";
import { Buffer } from "buffer";
import _ from "lodash";

async function onUpdateFailure(e) {
  NodeLogger.getInstance().warn(`Error: Update failure (${e})`);
  console.error(e);
}

interface OpenIntervalEventData {
  aggregator_address: string;
  queue_address: string;
}

export class UpdateRoutine extends SwitchboardRoutine {
  eventName = "Update";

  errorHandler = onUpdateFailure;
  successHandler = undefined;
  retryInterval = 0;
  feedsWithOpenedIntervals: string[] = [];
  openIntervalEvent: SuiEvent;

  constructor(
    readonly taskRunner: SwitchboardTaskRunner,
    readonly oracle: OracleAccount,
    readonly queue: OracleQueueAccount,
    readonly account: Keypair
  ) {
    super(30000); // 30 seconds

    // listen to open interval events
    this.openIntervalEvent = new SuiEvent(
      this.oracle.provider,
      this.oracle.switchboardAddress,
      `aggregator_save_result_action`,
      `${this.oracle.switchboardAddress}::events::AggregatorUpdateEvent`
    );

    // add a listener for open interval events
    this.openIntervalEvent.onTrigger(async (e: EventEnvelope) => {
      if (e.parsedJson?.queue_address === this.queue.address) {
        const event = e.parsedJson as OpenIntervalEventData;
        this.feedsWithOpenedIntervals.push(event.aggregator_address);
      }
    });
  }

  routine = async () => {
    NodeLogger.getInstance().debug(
      `Initiating update search using payer ${this.account
        .getPublicKey()
        .toSuiAddress()}`
    );

    try {
      const results = new Array<[AggregatorAccount, TaskRunnerResult]>();

      // grab fresh queue data
      const queueData = await this.queue.loadData();

      // grab feeds
      const crankableFeeds = Object.keys(
        await getTableData<string, boolean>(
          this.oracle.provider,
          queueData.crank_feeds
        )
      );

      // get oracle index in queue
      const oracleIdx = await this.queue.findOracleIdx(this.oracle.address);

      // create a transaction to batch updates
      const tx = new TransactionBlock();

      // if any feeds have manually been opened, add them to the list of feeds to crank
      if (this.feedsWithOpenedIntervals.length) {
        crankableFeeds.push(...this.feedsWithOpenedIntervals);
        this.feedsWithOpenedIntervals = []; // and clear the manually updated list
      }

      // check if we need to execute the tx this interval
      let shouldExecute = false;

      // loop through feeds and try to crank
      for (const address of crankableFeeds) {
        const aggregator = new AggregatorAccount(
          this.oracle.provider,
          address,
          this.oracle.switchboardAddress
        );

        // grab the feed data
        const feed = await aggregator.loadData();
        const nextAllowedUpdateTimeSeconds =
          parseInt(feed.update_data.fields.latest_timestamp) +
          parseInt(feed.min_update_delay_seconds);
        const nextIntervalStartTimeSeconds = parseInt(
          feed.next_interval_refresh_time
        );

        // check if there is a payout available on the node
        const currentPayouts = parseInt(feed.curr_interval_payouts);
        const batchSize = parseInt(feed.batch_size);
        const nowSeconds = Date.now() / 1000;

        // can we get a payout
        const canAggregatorPayout =
          currentPayouts < batchSize ||
          nextIntervalStartTimeSeconds < nowSeconds;

        // // get the current index of the queue at the snapshot
        // const currIdx = parseInt(queueData.curr_idx);

        // // get the feed batch size
        // const batchSize = parseInt(queueData.batch_size);

        // // calculate the start and end index of the batch
        // const queueSize = parseInt(queueData.data.contents.size);
        // const startIdx = currIdx;
        // const endIdx = (currIdx + batchSize) % queueSize;
        // // check if oracle is in the batch size range
        // const isOracleAllowedToCrank =
        //   (startIdx <= endIdx &&
        //     oracleIdx >= startIdx &&
        //     oracleIdx <= endIdx) ||
        //   (startIdx >= endIdx && oracleIdx >= startIdx && oracleIdx <= endIdx);

        // check if we should try and update the feed
        if (nextAllowedUpdateTimeSeconds < nowSeconds && canAggregatorPayout) {
          let jobs: OracleJob[];
          try {
            jobs = await aggregator.loadJobs();
          } catch (e) {
            NodeLogger.getInstance().warn(
              `Error: Failed to load jobs for aggregator ${aggregator.address} (${e})`
            );
            continue;
          }
          try {
            console.log(
              `Saving result for ${Buffer.from(feed.name, "base64")} ${
                aggregator.address
              }`
            );

            const feedResult: TaskRunnerResult = await this.taskRunner.runJobs(
              jobs.map((j, idx) => {
                // map jobs to IJobDefinition
                return {
                  job: j,
                  jobKey: feed.job_keys[idx],
                  weight: parseInt(feed.job_weights[idx]),
                };
              }),
              {
                address: aggregator.address,
                name: Buffer.from(feed.name, "base64").toString(),
                minJobResults: parseInt(feed.min_job_results),
                latestRoundResult: new SuiDecimal(
                  feed.update_data.fields.latest_result.fields.value.toString(),
                  feed.update_data.fields.latest_result.fields.dec,
                  feed.update_data.fields.latest_result.fields.neg
                ).toBig(),
                latestRoundTimestamp: parseInt(
                  feed.update_data.fields.latest_timestamp
                ),
                varianceThreshold: new SuiDecimal(
                  feed.variance_threshold.fields.value.toString(),
                  9,
                  false
                ).toBig(),
                forceReportPeriod: parseInt(feed.force_report_period),
              }
            );

            if (!taskRunnerSuccess(feedResult)) {
              // we already logged
              continue;
            } else {
              shouldExecute = true;
            }

            if (!SuiEnvironment.getInstance().LOCALNET) {
              try {
                // since we just save straight away on Sui, treat saves as a new round
                NodeMetrics.getInstance()?.handleNewRound(
                  /* address= */ aggregator.address,
                  /* latestRoundOpenTimestamp= */ Number.parseInt(
                    feed.update_data.values.latest_timestamp
                  ),
                  /* feedResult= */ feedResult
                );
              } catch {}
            }

            NodeLogger.getInstance().info(
              `Responding to ${Buffer.from(feed.name, "base64")} ${
                aggregator.address
              }: ${feedResult.median}; all: ${JSON.stringify(
                feedResult.jobs.filter(filterJobResults).map((r) => r.result)
              )}`,
              aggregator.address
            );

            // try save result
            aggregator.saveResultTx(
              {
                oracleAddress: this.oracle.address,
                oracleIdx: oracleIdx,
                queueAddress: this.queue.address,
                value: feedResult.median,
              },
              tx
            );
          } catch (e) {
            console.log(e);
          }
        }
      }

      // only send the transaction if we have updates to send
      if (shouldExecute) {
        // send the transaction block
        const signerWithProvider = new RawSigner(
          this.account,
          this.oracle.provider
        );
        const result = await sendSuiTx(signerWithProvider, tx);
        NodeLogger.getInstance().debug(`Update(s) Tx hash: ${result.digest}`);

        // Send each result from this TX to our telemetry results.
        results.forEach(([aggregator, feedResult]) =>
          NodeTelemetry.getInstance().sendFeedResult({
            environment: SuiEnvironment.getInstance(),
            aggregatorAddress: aggregator.address,
            oracleAddress: this.oracle.address,
            feedResult: feedResult,
            signature: result.digest,
          })
        );
      }
    } catch (e) {
      onUpdateFailure(e);
    }
  };
}
