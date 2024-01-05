import { AptosEnvironment } from "../../src/env/AptosEnvironment";

import { HexString } from "aptos";
import fs from "fs";

const EXPECTED_ADDRESS = HexString.ensure(
  "0x6723151b5b184d5621d964031c025fd084cf06e9a5ad3a496d4b07d6ff14d1e5"
);

describe("process.env", () => {
  it("loads aptos account from secret key bytes", async () => {
    const fileString = fs.readFileSync(
      "./tests/aptos/data/keypair-testing.bytes.json",
      "utf8"
    );
    const account = AptosEnvironment.parseKeypairString(fileString);
    if (account.address().toString() !== EXPECTED_ADDRESS.toString()) {
      throw new Error(
        `Failed to load correct aptos account, expected  ${EXPECTED_ADDRESS}, received ${account.address()}`
      );
    }
  });

  it("loads aptos account from formatted secret key bytes", async () => {
    const fileString = fs.readFileSync(
      "./tests/aptos/data/keypair-testing.bytes.formatted.json",
      "utf8"
    );
    const account = AptosEnvironment.parseKeypairString(fileString);
    if (account.address().toString() !== EXPECTED_ADDRESS.toString()) {
      throw new Error(
        `Failed to load correct aptos account, expected  ${EXPECTED_ADDRESS}, received ${account.address()}`
      );
    }
  });

  it("loads aptos account from hex secret key", async () => {
    const fileString = fs.readFileSync(
      "./tests/aptos/data/keypair-testing.hex.txt",
      "utf8"
    );
    const account = AptosEnvironment.parseKeypairString(fileString);
    if (account.address().toString() !== EXPECTED_ADDRESS.toString()) {
      throw new Error(
        `Failed to load correct aptos account, expected  ${EXPECTED_ADDRESS}, received ${account.address()}`
      );
    }
  });

  it("loads aptos account from trimmed hex secret key", async () => {
    const fileString = fs.readFileSync(
      "./tests/aptos/data/keypair-testing.hex.trimmed.txt",
      "utf8"
    );
    const account = AptosEnvironment.parseKeypairString(fileString);
    if (account.address().toString() !== EXPECTED_ADDRESS.toString()) {
      throw new Error(
        `Failed to load correct aptos account, expected  ${EXPECTED_ADDRESS}, received ${account.address()}`
      );
    }
  });
});
