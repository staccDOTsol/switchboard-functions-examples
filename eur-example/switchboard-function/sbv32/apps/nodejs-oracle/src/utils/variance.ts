import type { Big } from "@switchboard-xyz/common";

// This function returns the ratio between the max value and the min value.
// If we pull data that may be negative, this information is not entirely relevant.
export function variance(results: Array<Big>): Big {
  if (results?.length === 0) {
    throw new Error("Cannot take variance of empty array");
  }
  const arrSort = results
    .slice()
    .sort((n1: Big, n2: Big) => n1.minus(n2).toNumber());
  const min = arrSort[0];
  const max = arrSort[arrSort.length - 1];
  return max.minus(min);
}
