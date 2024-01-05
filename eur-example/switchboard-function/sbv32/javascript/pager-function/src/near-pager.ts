/* eslint-disable eqeqeq */
//const b58 = require("b58");
import { configList } from "./function";
import { Pager } from "./pager";

import { bs58 } from "@switchboard-xyz/common";
import {
  AggregatorAccount,
  OracleAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/near.js";
import { KeyPair, Near } from "near-api-js";

type NearNetwork = "testnet" | "mainnet" | "betanet" | "localnet";

export async function checkNearFeed(
  address: string,
  minTillStale: number,
  network: string
): Promise<string> {
  const pager = new Pager(
    configList.defaultPdKey[network],
    "Near " + network + " Alert:",
    "near",
    network
  );
  const rpcUrl = configList.near[network].rpc;
  const payerKeypair = KeyPair.fromRandom("ed25519");
  let namedAccount = "";
  if (network === "mainnet") {
    namedAccount = "sbv2-authority.near";
  }
  if (network === "testnet") {
    namedAccount = "sbv2-authority.testnet";
  }
  if (
    String(network) != "testnet" &&
    String(network) != "mainnet" &&
    String(network) != "betanet" &&
    String(network) != "localnet"
  ) {
    console.error("invalid network name: " + network);
    return "invalid network name " + network;
  }
  const program = await SwitchboardProgram.loadFromKeypair(
    network as NearNetwork,
    rpcUrl,
    namedAccount,
    payerKeypair
  );
  const addressUint8 = new Uint8Array(bs58.decode(address));
  const aggregatorAccount = new AggregatorAccount({
    program: program,
    address: addressUint8,
  });
  const aggregator = await aggregatorAccount.loadData();
  const staleness =
    Date.now() / 1000 -
    aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber();
  if (staleness / 60 > minTillStale) {
    pager.sendPage(`Stale Feed (${staleness} seconds): ` + address);
    console.log(`Paging Stale Feed (${staleness} seconds): ` + address);
  }
  const result = `feed is ${staleness} seconds stale`;
  console.log(result);
  return result;
}

//don't need check balance because it's baked into oracle
// checkNearFeed(
//   "21EKutL6JAudcS2MVvfgvCsKqxLNovy72rqpwo4gwzfR",
//   1,
//   "testnet"
// ).then();
