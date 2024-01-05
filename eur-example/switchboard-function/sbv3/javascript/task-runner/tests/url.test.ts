import "jest";

import * as errors from "../src/errors.js";
import { verifyUrl } from "../src/utils/http.js";

describe("URL tests", () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("validates hostname correctly", async () => {
    const url = verifyUrl("http://google.com:8080");

    expect(url.hostname).toEqual("google.com");
  });

  it("fails to validate url if localhost", async () => {
    expect(() => {
      verifyUrl("http://localhost:8080");
    }).toThrow(errors.HostnameDisabled);
  });

  it("fails to validate url if ftx.us", async () => {
    expect(() => {
      verifyUrl("http://ftx.us");
    }).toThrow(errors.HostnameDisabled);
  });

  it("fails to validate url if private IP", async () => {
    expect(() => {
      verifyUrl("http://10.10.10.10:8080");
    }).toThrow(errors.HostnameDisabled);
  });

  it("localhost is permitted if $ALLOW_LOCALHOST is set", async () => {
    process.env.ALLOW_LOCALHOST = "true";

    const url = verifyUrl("http://localhost:8080");
    expect(url.hostname).toEqual("localhost");
  });
});
