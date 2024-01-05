import { TaskRunnerWorker } from "../ctx/worker/index.js";
import type { IJobContext } from "../types/JobContext.js";

import { PublicKey } from "@solana/web3.js";
import { Big, BigUtils, BN, OracleJob, sleep } from "@switchboard-xyz/common";
import * as sbv2 from "@switchboard-xyz/solana.js";
import type { AggregatorHistoryRow } from "@switchboard-xyz/solana.js/generated/types";
/**
 * Takes a twap over a set period for a certain aggregator.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iTwapTask] A TwapTask to run.
 * @throws {String}
 * @returns {Promise<Big>}
 */
export async function twapTask(
  ctx: IJobContext,
  iTwapTask: OracleJob.ITwapTask
): Promise<Big> {
  const worker = TaskRunnerWorker.getInstance();
  const twapTask = OracleJob.TwapTask.fromObject(iTwapTask);

  let end: BN;
  if (twapTask.endingUnixTimestampTask) {
    const taskResult = await ctx.task.cronParseTask(
      ctx,
      twapTask.endingUnixTimestampTask!
    );
    end = new BN(
      typeof taskResult === "string"
        ? taskResult
        : new Big(taskResult).toFixed()
    );
  } else if (twapTask.endingUnixTimestamp) {
    end = new BN(twapTask.endingUnixTimestamp);
  } else {
    end = (await sbv2.SolanaClock.fetch(ctx.program.provider.connection))
      .unixTimestamp;
  }

  const start = end.sub(new BN(twapTask.period));

  if (worker.enabled && worker.twapEnabled) {
    const result = await worker.twap(
      twapTask,
      [start.toNumber(), end.toNumber()],
      ctx.program.provider.connection.rpcEndpoint // devnet should read devnet history buffers
    );
    return new Big(result);
  } else {
    const aggregatorAccount = new sbv2.AggregatorAccount(
      ctx.program,
      new PublicKey(twapTask.aggregatorPubkey)
    );

    const history = await aggregatorAccount.loadHistory(
      start.toNumber(),
      end.toNumber()
    );
    if (history.length === 0) {
      throw new Error("InsufficientHistoryForTwapError");
    }

    const result = await calcWeightedTwap(
      history,
      [start, end],
      iTwapTask.minSamples ?? 1
    );
    return result;
  }
}

export async function calcWeightedTwap(
  history: Array<AggregatorHistoryRow>,
  historyInterval: [BN, BN],
  minSamples = 1
): Promise<Big> {
  if (history.length === 0) {
    throw new Error("InsufficientHistoryForTwapError");
  }

  if (history.length < minSamples) {
    throw new Error(
      `InsufficientHistoryForTwapError, need ${minSamples}, have ${history.length}`
    );
  }

  const [startTimestamp, endTimestamp] = historyInterval;

  const lastIndex = history.length - 1;
  let idx = lastIndex;
  let weightedSum = new Big(0);
  let nextTimestamp = endTimestamp;
  let interval = new BN.BN(0);
  let numSamples = 0;
  let currentRow = history[idx];
  while (idx >= 0 && currentRow.timestamp.gte(startTimestamp)) {
    // every 100 iterations, give the event loop time to poll other phases
    if (idx % 100 === 0) {
      await sleep(0);
    }

    if (currentRow.timestamp.gt(endTimestamp)) {
      --idx;
      currentRow = history[idx];
      continue;
    }

    const propagationTime = nextTimestamp.sub(currentRow.timestamp);
    nextTimestamp = currentRow.timestamp;

    weightedSum = weightedSum.add(
      currentRow.value.toBig().mul(BigUtils.fromBN(propagationTime))
    );
    ++numSamples;
    --idx;

    interval = interval.add(propagationTime);
    currentRow = history[idx];
  }
  if (idx >= 0) {
    const propagationTime = nextTimestamp.sub(startTimestamp);
    interval = interval.add(propagationTime);
    weightedSum = weightedSum.add(
      currentRow.value.toBig().mul(BigUtils.fromBN(propagationTime))
    );
    ++numSamples;
  }

  if (numSamples < minSamples) {
    throw new Error(
      `InsufficientHistoryForTwapError, need ${minSamples}, have ${numSamples}`
    );
  }

  const result = BigUtils.safeDiv(weightedSum, BigUtils.fromBN(interval));
  return result;
}
