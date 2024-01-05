import { Big, BigUtils } from "@switchboard-xyz/common";

describe("weighted-median test", () => {
  it("weighted median with even number of elements and equal weight", async () => {
    // [99.05, 100, 100.05, 100.25]
    const entries: Array<BigUtils.WeightedValue> = [
      {
        idx: 1,
        value: new Big(100.05),
        weight: 1,
      },
      {
        idx: 2,
        value: new Big(100.25),
        weight: 1,
      },
      {
        idx: 3,
        value: new Big(99.05),
        weight: 1,
      },
      {
        idx: 4,
        value: new Big(100.0),
        weight: 1,
      },
    ];

    const median = BigUtils.weightedMedian(entries);
    expect(median).toStrictEqual(new Big(100.025));
  });

  it("weighted median with odd number of elements and equal weight", async () => {
    // [99.05, 100.05, 100.25]
    //            ^
    //         100.05
    const entries: Array<BigUtils.WeightedValue> = [
      {
        idx: 1,
        value: new Big(100.05),
        weight: 1,
      },
      {
        idx: 2,
        value: new Big(100.25),
        weight: 1,
      },
      {
        idx: 3,
        value: new Big(99.05),
        weight: 1,
      },
    ];

    const median = BigUtils.weightedMedian(entries);
    expect(median).toStrictEqual(new Big(100.05));
  });

  it("weighted median overwrites 0 weight with 1", async () => {
    // [99.05, 100, 100.05, 100.25]
    //             ^
    //           100.025
    const entries: Array<BigUtils.WeightedValue> = [
      {
        idx: 1,
        value: new Big(100.05),
        weight: 0,
      },
      {
        idx: 2,
        value: new Big(100.25),
        weight: 0,
      },
      {
        idx: 3,
        value: new Big(99.05),
        weight: 1,
      },
      {
        idx: 4,
        value: new Big(100.0),
        weight: 1,
      },
    ];

    const median = BigUtils.weightedMedian(entries);
    expect(median).toStrictEqual(new Big(100.025));
  });

  it("weighted median with variable weights takes the weighted average of halfWeight point", async () => {
    // [99.05 (12), 99.75 (24), 99.8 (14), 100.24 (20), 100.36 (30)], halfWeight = 50
    //                                    ^
    //                                  100.021
    const entries: Array<BigUtils.WeightedValue> = [
      {
        idx: 1,
        value: new Big(99.05),
        weight: 12,
      },
      {
        idx: 2,
        value: new Big(99.75),
        weight: 24,
      },
      {
        idx: 3,
        value: new Big(99.8),
        weight: 14,
      },
      {
        idx: 4,
        value: new Big(100.24),
        weight: 20,
      },
      {
        idx: 5,
        value: new Big(100.36),
        weight: 30,
      },
    ];

    const median = BigUtils.weightedMedian(entries);
    const weightedAvg = BigUtils.weightedAverage(
      new Big(99.8),
      new Big(14),
      new Big(100.24),
      new Big(20)
    );
    expect(median).toStrictEqual(weightedAvg);

    const numericWeightedAverage = (99.8 * 14 + 100.24 * 20) / (14 + 20);
    expect(
      weightedAvg.toNumber() /* we lose precision using the numeric version */
    ).toStrictEqual(numericWeightedAverage);
  });

  it("weighted median with variable weights take halfWeight point", async () => {
    // [99.05 (20), 99.55(30), 99.75 (8), 100.05 (11), 100.25 (22)], halfWeight = 45.5
    //                ^
    //              99.55
    const entries: Array<BigUtils.WeightedValue> = [
      {
        idx: 1,
        value: new Big(100.05),
        weight: 11,
      },
      {
        idx: 2,
        value: new Big(100.25),
        weight: 22,
      },
      {
        idx: 3,
        value: new Big(99.05),
        weight: 20,
      },
      {
        idx: 4,
        value: new Big(99.55),
        weight: 30,
      },
      {
        idx: 5,
        value: new Big(99.75),
        weight: 8,
      },
    ];

    const median = BigUtils.weightedMedian(entries);
    expect(median).toStrictEqual(new Big(99.55));
  });

  it("extremely weighted element is always the yielded value", async () => {
    const extremelyWeightedElement: BigUtils.WeightedValue = {
      idx: 1,
      value: new Big(100.05),
      weight: 90,
    };
    const entries: Array<BigUtils.WeightedValue> = [
      extremelyWeightedElement,
      {
        idx: 2,
        value: new Big(1),
        weight: 1,
      },
      {
        idx: 3,
        value: new Big(1),
        weight: 1,
      },
      {
        idx: 4,
        value: new Big(1),
        weight: 1,
      },
      {
        idx: 5,
        value: new Big(1),
        weight: 1,
      },
    ];

    const median = BigUtils.weightedMedian(entries);
    expect(median).toStrictEqual(extremelyWeightedElement.value);
  });

  it("weighted median of single element array equals that element", async () => {
    const element: BigUtils.WeightedValue = {
      idx: 2,
      value: new Big(1),
      weight: 1,
    };
    const entries: Array<BigUtils.WeightedValue> = [element];

    const median = BigUtils.weightedMedian(entries);
    expect(median).toStrictEqual(element.value);
  });

  it("weighted median of empty array throws error", async () => {
    const entries: Array<BigUtils.WeightedValue> = [];

    expect(() => {
      BigUtils.weightedMedian(entries);
    }).toThrowError("Cannot take median of empty array.");
  });
});
