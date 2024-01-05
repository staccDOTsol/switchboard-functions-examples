import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  Big,
  BN,
  OracleJob,
  SwitchboardDecimal,
} from "@switchboard-xyz/common";
import * as sbv2 from "@switchboard-xyz/solana.js";
import { JSONPath } from "jsonpath-plus";
import workerpool from "workerpool";

function safeDiv(number_: Big, denominator: Big, decimals = 20): Big {
  const oldDp = Big.DP;
  Big.DP = decimals;
  const result = number_.div(denominator);
  Big.DP = oldDp;
  return result;
}

function fromBN(n: BN, decimals = 0): Big {
  const big = new SwitchboardDecimal(n, decimals).toBig();
  // assert(n.cmp(new BN(big.toFixed())) === 0);
  return big;
}

async function weightedTwap(
  iTwapTask: OracleJob.ITwapTask,
  historyInterval: [number, number],
  connectionEndpoint: string
): Promise<string> {
  try {
    const twapTask = OracleJob.TwapTask.create(iTwapTask);

    const provider = new AnchorProvider(
      new Connection(connectionEndpoint),
      new Wallet(Keypair.fromSeed(new Uint8Array(32).fill(1))),
      {}
    );

    const program = new sbv2.SwitchboardProgram(
      provider,
      new sbv2.NativeMint(provider)
    );

    const aggregatorAccount = new sbv2.AggregatorAccount(
      program,
      new PublicKey(twapTask.aggregatorPubkey)
    );

    const minSamples = twapTask.minSamples ?? 1;
    const [startTimestamp, endTimestamp] = historyInterval.map(
      (t) => new BN(t)
    );

    const history = await aggregatorAccount.loadHistory(
      startTimestamp.toNumber(),
      endTimestamp.toNumber()
    );

    if (history.length === 0) {
      throw new Error("InsufficientHistoryForTwapError");
    }

    if (history.length < minSamples) {
      throw new Error(
        `InsufficientHistoryForTwapError, need ${minSamples}, have ${history.length}`
      );
    }

    const lastIndex = history.length - 1;
    let idx = lastIndex;
    let weightedSum = new Big(0);
    let nextTimestamp = endTimestamp;
    let interval = new BN(0);
    let numSamples = 0;
    let currentRow = history[idx];
    while (idx >= 0 && currentRow.timestamp.gte(startTimestamp)) {
      if (currentRow.timestamp.gt(endTimestamp)) {
        --idx;
        currentRow = history[idx];
        continue;
      }

      const propagationTime = nextTimestamp.sub(currentRow.timestamp);
      nextTimestamp = currentRow.timestamp;

      weightedSum = weightedSum.add(
        currentRow.value.toBig().mul(fromBN(propagationTime))
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
        currentRow.value.toBig().mul(fromBN(propagationTime))
      );
    }

    if (numSamples < minSamples) {
      throw new Error(
        `InsufficientHistoryForTwapError, need ${minSamples}, have ${numSamples}`
      );
    }

    const result = safeDiv(weightedSum, fromBN(interval));

    return result.toString(); // Big.js cant be encoded by Node.js worker
  } catch (error) {
    throw error;
  }
}

function jsonPathArray(path: string, data: string): string {
  try {
    const results: Array<string> = [];
    JSONPath({
      json: JSON.parse(data),
      path: path!,
      callback: (val) => results.push(val),
    });
    return JSON.stringify(results);
  } catch (error) {
    console.error(`JSON_PATH_ARRAY_WORKER`, error);
  }
  return JSON.stringify([]);
}

function jsonPathEval(path: string, data: string): string {
  try {
    return JSONPath({
      json: JSON.parse(data),
      path: path,
    });
  } catch (error) {
    console.error(`JSON_PATH_EVAL_WORKER`, error);
  }
  return "";
}

workerpool.worker({
  jsonPathArray: jsonPathArray,
  jsonPath: jsonPathEval,
  twap: weightedTwap,
});
