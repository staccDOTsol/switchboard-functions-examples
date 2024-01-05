import { BaseEnvironment } from "../src/env/BaseEnvironment";

import { extractNonNullableStringEnvVars } from "@switchboard-xyz/node";
import assert from "assert";

class MyEnvironment extends BaseEnvironment {
  public get isLocalnet(): boolean {
    return false;
  }

  constructor() {
    super();
  }
}

describe("NodeEnvironment", () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("reads and sets the CHAIN environment variable", () => {
    process.env.CHAIN = "solana";
    const env = new MyEnvironment();

    assert(
      env.CHAIN === "solana",
      `The environment variable "CHAIN" was set to an incorrect value, expected 'solana', received '${env.CHAIN}'`
    );
  });

  // it("throws an error if CHAIN is not provided", () => {
  //   process.env.CHAIN = undefined;
  //   expect(getChain).toThrow(new RegExp(/\$CHAIN needs to be/g));
  // });

  // it("throws an error if CHAIN is not set to a valid enum", () => {
  //   process.env.CHAIN = "notavalidchain";

  //   expect(getChain).toThrow(new RegExp(/\$CHAIN needs to be/g));
  // });

  it("reads and sets a variable from multiple options", () => {
    process.env.MADE_UP_VARIABLE = "wtfbbq";
    process.env.MADE_UP_OPTION_3 = "nope";
    const madeUpVariable = extractNonNullableStringEnvVars(
      "MADE_UP_OPTION_1",
      "MADE_UP_OPTION_2",
      "MADE_UP_VARIABLE",
      "MADE_UP_OPTION_3"
    );
    assert(
      madeUpVariable === "wtfbbq",
      `The environment variable "MADE_UP_VARIABLE" was set to an incorrect value, expected 'wtfbbq', received '${madeUpVariable}'`
    );
  });
});
