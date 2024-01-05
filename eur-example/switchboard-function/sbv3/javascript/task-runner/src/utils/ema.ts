import { Big, BigUtils, sleep } from "@switchboard-xyz/common";
import type * as sbv2 from "@switchboard-xyz/solana.js";

const TAG = `EwmaTask`;

export async function ema(
  history: Array<sbv2.types.AggregatorHistoryRow>,
  lambda: number,
  period: number,
  now = Math.round(Date.now() / 1000)
): Promise<Big> {
  if (!lambda) {
    throw new Error(`${TAG}: 'lambda' is not defined`);
  }
  if (lambda <= 0 || lambda > 1) {
    throw new Error(`${TAG}: 'lambda' should be between 0 and 1`);
  }
  if (!period) {
    throw new Error(`${TAG}: 'period' is not defined`);
  }

  const end1 = now;
  const start1 = end1 - period;
  let numSamples1 = 0;
  let sum1 = new Big(0);

  const end2 = start1;
  const start2 = end2 - period;
  let numSamples2 = 0;
  let sum2 = new Big(0);

  let idx = history.length - 1;
  let didBreak = false;
  // reversed
  while (idx > -1) {
    const row = history[idx];
    const timestamp = row.timestamp.toNumber();
    if (timestamp > end1) {
      idx = idx - 1;
      continue;
    }
    if (timestamp < start2) {
      didBreak = true;
      break;
    }

    if (idx % 100 === 0) {
      await sleep(1); // give event loop time to process socket requests
    }

    if (timestamp < end1 && timestamp > start1) {
      sum1 = sum1.add(row.value.toBig());
      numSamples1 = numSamples1 + 1;
    }

    if (timestamp < end2 && timestamp > start2) {
      sum2 = sum2.add(row.value.toBig());
      numSamples2 = numSamples2 + 1;
    }

    idx = idx - 1;
  }

  if (!didBreak) {
    throw new Error(`${TAG}: Failed to find enough valid samples`);
  }

  if (numSamples1 <= 0) {
    throw new Error(`${TAG}: Failed to find enough valid samples`);
  }
  const sma1 = BigUtils.safeDiv(sum1, new Big(numSamples1));

  if (numSamples2 <= 0) {
    throw new Error(`${TAG}: Failed to find enough valid samples`);
  }
  const sma2 = BigUtils.safeDiv(sum2, new Big(numSamples2));

  const result = BigUtils.safeMul(sma1, new Big(lambda)).add(
    BigUtils.safeMul(sma2, new Big(1 - lambda))
  );
  return result;
}
