import "jest";

import * as anchor from "@coral-xyz/anchor";
import { Big } from "@switchboard-xyz/common";
import { types } from "@switchboard-xyz/solana.js";

describe("twap test", () => {
  const twapData: types.AggregatorHistoryRow[] = [
    {
      // 8:55 PM
      timestamp: new anchor.BN("1658436900"),
      value: new Big("81"),
    },
    {
      // 9 PM
      timestamp: new anchor.BN("1658437200"),
      value: new Big("85"),
    },
    {
      // 9:05 PM
      timestamp: new anchor.BN("1658437500"),
      value: new Big("90"),
    },
    {
      // 9:15 PM
      timestamp: new anchor.BN("1658438100"),
      value: new Big("80"),
    },
    {
      // 9:17 PM
      timestamp: new anchor.BN("1658438220"),
      value: new Big("120"),
    },
    {
      // 9:32 PM
      timestamp: new anchor.BN("1658439120"),
      value: new Big("50"),
    },
    {
      // 9:45 PM
      timestamp: new anchor.BN("1658439900"),
      value: new Big("40"),
    },
    {
      // 9:50 PM
      timestamp: new anchor.BN("1658440200"),
      value: new Big("30"),
    },
    {
      // 9:58 PM
      timestamp: new anchor.BN("1658440680"),
      value: new Big("50"),
    },
    {
      // 10:05 PM
      timestamp: new anchor.BN("1658441100"),
      value: new Big("180"),
    },
  ].map((row) => {
    return new types.AggregatorHistoryRow({
      timestamp: row.timestamp,
      value: types.SwitchboardDecimal.fromBig(row.value),
    });
  });

  it("TODO: Add test", async () => {});

  // it("calculates the weighted twap", async () => {
  //   const lastTimestamp = twapData.slice(-1)[0].timestamp;
  //   const twapInterval: [anchor.BN, anchor.BN] = [
  //     lastTimestamp.sub(new anchor.BN(3600)),
  //     lastTimestamp,
  //   ];
  //   const [start, end] = twapInterval;
  //   const revolvingTwap = weightedTwap(twapData, twapInterval, 8);

  //   const filteredEntries = twapData.filter(
  //     (row) => row.timestamp.gte(start) && row.timestamp.lte(end)
  //   );

  //   const weightedSum = filteredEntries
  //     .reverse()
  //     .map((row, index) => {
  //       if (index === 0) {
  //         const t = fromBN(end.sub(row.timestamp));
  //         // console.log(`(${t} * ${row.value})`);
  //         return row.value.mul(t);
  //       } else {
  //         const t = fromBN(
  //           filteredEntries[index - 1].timestamp.sub(row.timestamp)
  //         );
  //         // console.log(`(${t} * ${row.value})`);
  //         return row.value.mul(t);
  //       }
  //     })
  //     // need to get the weight from start up to first filtered element
  //     .concat(
  //       ...[0].map(() => {
  //         const startEl = twapData.findIndex((r) =>
  //           r.timestamp.eq(filteredEntries.slice(-1)[0].timestamp)
  //         );
  //         if (startEl === 0) {
  //           return new Big(0);
  //         }
  //         const t = fromBN(twapData[startEl].timestamp.sub(start));
  //         // console.log(`(${t} * ${twapData[startEl - 1].value})`);
  //         return twapData[startEl - 1].value.mul(t);
  //       })
  //     )
  //     .reduce((a, b) => (a = a.add(b)), new Big(0));

  //   const weightedAverage = safeDiv(weightedSum, fromBN(end.sub(start)));

  //   expect(revolvingTwap).toStrictEqual(weightedAverage);
  // });
});
