import { SolanaEnvironment } from "../../src/env/SolanaEnvironment";

import { PublicKey } from "@solana/web3.js";
import fs from "fs";

const EXPECTED_PUBLICKEY = new PublicKey(
  "A7VNQWpvFpH5fqZoHmpfVSTp8j9tVsogqdBcU7VY5qk2"
);

describe("process.env", () => {
  it("loads solana keypair from solana CLI output", async () => {
    const fileString = fs.readFileSync(
      "./tests/solana/data/keypair-testing.bytes.json",
      "utf8"
    );
    const keypair = SolanaEnvironment.parseKeypairString(fileString);
    if (
      !keypair.publicKey.equals(
        new PublicKey("A7VNQWpvFpH5fqZoHmpfVSTp8j9tVsogqdBcU7VY5qk2")
      )
    ) {
      throw new Error(
        `Failed to load correct keypair, expected  A7VNQWpvFpH5fqZoHmpfVSTp8j9tVsogqdBcU7VY5qk2, received ${keypair.publicKey}`
      );
    }
  });

  it("loads solana keypair from formatted keypair output", async () => {
    const fileString = fs.readFileSync(
      "./tests/solana/data/keypair-testing.bytes.formatted.json",
      "utf8"
    );
    const keypair = SolanaEnvironment.parseKeypairString(fileString);
    if (
      !keypair.publicKey.equals(
        new PublicKey("A7VNQWpvFpH5fqZoHmpfVSTp8j9tVsogqdBcU7VY5qk2")
      )
    ) {
      throw new Error(
        `Failed to load correct keypair, expected  A7VNQWpvFpH5fqZoHmpfVSTp8j9tVsogqdBcU7VY5qk2, received ${keypair.publicKey}`
      );
    }
  });

  it("fails to load keypair with missing bytes", async () => {
    const fileString = fs.readFileSync(
      "./tests/solana/data/keypair-testing.bytes.missing.json",
      "utf8"
    );
    try {
      const keypair = SolanaEnvironment.parseKeypairString(fileString);
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        throw error;
      }
      if (!error.toString().includes("bad secret key size")) {
        throw error;
      }
    }
  });
});
