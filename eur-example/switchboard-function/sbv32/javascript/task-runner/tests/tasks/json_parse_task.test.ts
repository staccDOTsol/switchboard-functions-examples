import type { TaskResult, TaskRunner } from "../../src";
import { JobContext } from "../../src";
import { TaskRunnerTestContext } from "../setup";

import { OracleJob } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";
// import dotenv from "dotenv";
// dotenv.config();

describe(`JsonParseTask tests`, () => {
  let taskRunner: TaskRunner;

  // const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    // process.env = { ...OLD_ENV }; // Make a copy
  });

  beforeAll(async () => {
    if (taskRunner === undefined) {
      taskRunner = await TaskRunnerTestContext.getRunner();
    }
  });

  // afterAll(() => {
  //   process.env = OLD_ENV; // Restore old environment
  // });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await TaskRunnerTestContext.exit();
  });

  const citiesJson = JSON.stringify({
    cities: [
      {
        name: "Detroit",
        areaCode: 313,
      },
    ],
  });

  const doTask = async (
    input: string,
    iTask: OracleJob.IJsonParseTask
  ): Promise<TaskResult> => {
    const ctx = new JobContext(
      taskRunner,
      "",
      OracleJob.fromObject({}),
      undefined,
      input
    );
    return await taskRunner.tasks.run(ctx, { jsonParseTask: iTask });
  };

  it(`Input is required to run`, async () => {
    try {
      await doTask("", { path: "" });
      throw new Error(`JsonPathTask failed to throw expected error`);
    } catch (error) {}
  });

  it(`Parsing a value out of the JSON returns the value`, async () => {
    // Parse Detroit's area code from json.
    const result = await doTask(citiesJson, {
      path: "$.cities[?(@.name == 'Detroit')].areaCode",
    });
    expect(result.big).toStrictEqual(new Big(313));
  });

  it(`Trying to parse a nonexistent value throws.`, async () => {
    // Try to parse Cleveland's area code from json.
    try {
      await doTask(citiesJson, {
        path: "$.cities[?(@.name == 'Cleveland')].areaCode",
      });
      throw new Error(
        `JsonPathTask: Failed to throw expected error parsing nonexistent value`
      );
    } catch (error) {}
  });

  describe(`AggregationMethod`, () => {
    const json = JSON.stringify({ priceList: [2, 1, 3, 4, 2] });

    it(`Parsing multiple values without an aggregation method throws.`, async () => {
      try {
        await doTask(json, { path: "$.priceList[*]" });
        throw new Error(
          `JsonPathTask: Failed to throw expected error when parsing result without an aggregation method`
        );
      } catch (error) {}
    });

    it(`AggregateMethod MAX works.`, async () => {
      // process.env.DISABLE_WORKERPOOL = "1";
      // process.env.DISABLE_WORKERPOOL_JSONPATH = "0";
      const result = await doTask(json, {
        path: "$.priceList[*]",
        aggregationMethod: OracleJob.JsonParseTask.AggregationMethod.MAX,
      });
      expect(result.big).toStrictEqual(new Big(4));
    });

    it(`AggregateMethod MIN works.`, async () => {
      // process.env.DISABLE_WORKERPOOL = "1";
      // process.env.DISABLE_WORKERPOOL_JSONPATH = "1";
      const result = await doTask(json, {
        path: "$.priceList[*]",
        aggregationMethod: OracleJob.JsonParseTask.AggregationMethod.MIN,
      });
      expect(result.big).toStrictEqual(new Big(1));
    });

    it(`AggregateMethod SUM works.`, async () => {
      const result = await doTask(json, {
        path: "$.priceList[*]",
        aggregationMethod: OracleJob.JsonParseTask.AggregationMethod.SUM,
      });
      expect(result.big).toStrictEqual(new Big(12));
    });
  });
});
