import "mocha";
import * as assert from "assert";
import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import { OracleJob } from "@switchboard-xyz/switchboard-api";
import { Keypair, PublicKey } from "@solana/web3.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Oracle Tests", () => {
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const program = anchor.workspace.SwitchboardV2;

  let oracleQueue: sbv2.OracleQueueAccount;
  let oracle: sbv2.OracleAccount;

  it("Initializes the Oracle Queue and an Oracle.", async () => {
    // oracleQueue = await sbv2.OracleQueueAccount.create(program, {});
  });
});
