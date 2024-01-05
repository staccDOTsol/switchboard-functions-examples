// https://www.npmjs.com/package/@google-cloud/secret-manager
import { configList } from "./function";
import { Pager } from "./pager";

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { AggregatorAccount } from "@switchboard-xyz/aptos.js";
import { AptosAccount, AptosClient, CoinClient, HexString } from "aptos";
import fetch from "node-fetch";

const NODE_URL =
  "https://aptos-api.rpcpool.com/8f545350616dc47e67cfb35dc857/v1";
// TODO: MAKE THIS THE DEPLOYER ADDRESS
const SWITCHBOARD_ADDRESS =
  "0x7d7e436f0b2aafde60774efb26ccc432cf881b677aca7faaf2a01879bd19fb8";
// TODO: MAKE THIS THE AUTHORITY THAT WILL OWN THE ORACLE
const QUEUE_ADDRESS =
  "0x11fbd91e4a718066891f37958f0b68d10e720f2edf8d57854fb20c299a119a8c";

async function accountBalance(
  client: AptosClient,
  address: string
): Promise<Number> {
  const out = await client.getAccountResource(
    address,
    "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
  );

  return Number((out.data as any).coin.value) / 100000000;
}

// async function sendPage(aggregator: any, e: string, routingKey: string) {
//   // if (cluster.toString().includes("devnet")) {
//   // routingKey = "faafe60385384309c077ed61303e50d0";
//   // }
//   let pdClient = new PdClient(routingKey);
//   let customDetails = {
//     group: "ABC",
//     error: e,
//     aggregator: aggregator,
//   };
//   let severity = "critical";
//   // if (cluster.toString().includes("devnet")) {
//   // severity = "info";
//   // }
//   let payload = {
//     payload: {
//       summary: "Aptos Alert v2: ", //+ cluster.toString(),
//       timestamp: new Date().toISOString(),
//       source: aggregator.toString(),
//       severity,
//       group: "ABC", //cluster.toString(),
//       custom_details: customDetails,
//     },
//     routing_key: routingKey,
//     event_action: "trigger",
//     client: "ABC",
//   };
//   console.log("Event sending to pagerduty:", payload);
//   await pdClient.events.sendEvent(payload);
// }

async function checkFeedHealth(
  address: string,
  minTillStale: number,
  PID: string,
  nodeUrl: string,
  pager: Pager,
  targetPrice?: number,
  varianceThreshold?: number
): Promise<any> {
  const client = new AptosClient(nodeUrl);
  const feedAccount = new AggregatorAccount(client, address, PID);
  const feed = await feedAccount.loadData();
  const price = feed.latestConfirmedRound.result.value.toNumber() / 1000000000;
  if (targetPrice && varianceThreshold) {
    if (
      price > targetPrice * (1 + varianceThreshold) ||
      price < targetPrice * (1 - varianceThreshold)
    ) {
      pager.sendPage({
        message: `excessive variance (target price: ${targetPrice} current price: ${price})`,
        address: address,
      });
    }
  }
  const threshold = minTillStale * 60;
  const now = +new Date() / 1000;
  const staleness =
    now - feed.latestConfirmedRound?.roundOpenTimestamp.toNumber();
  console.log(`staleness of aptos feed (${address}) is ${staleness} seconds`);
  // const threshold = minTillStale * 60;
  let page = false;
  if (staleness > threshold) {
    page = true;
    await pager.sendPage({
      message: "Feed is stale",
      address: address,
    });
  }
  return { staleness, threshold, page };
}

export const checkAptosBalance = async (
  network: string,
  nodeUrl: string,
  pid: string
) => {
  const pager = new Pager(
    configList.aptos[network].pdKey,
    `Aptos ${network} Alert v2: `,
    "aptos",
    network
  );

  try {
    const client = new AptosClient(nodeUrl);
    const turnerVal = await accountBalance(
      client,
      "0xca62eccbbdb22b5de18165d0bdf2d7127569b91498f0a7f6944028793cef8137"
    );
    const oracleVal = await accountBalance(
      client,
      "0xf92bc956b9e25f38a2e4829b58f03ca9724233985cdda3f818bc3e62d6ed7d9c"
    );
    const permissionlessOracleVal = await accountBalance(
      client,
      "0xef84c318543882400c4498c81759e18084a1a5f820bfc683e6f53e3daeb449e2"
    );
    let message = "";
    if (Number(turnerVal) < 1) {
      message +=
        "turner (0xca62eccbbdb22b5de18165d0bdf2d7127569b91498f0a7f6944028793cef8137) balance: " +
        turnerVal.toString() +
        "\n";
    }
    if (Number(oracleVal) < 1) {
      message +=
        "oracle (0xf92bc956b9e25f38a2e4829b58f03ca9724233985cdda3f818bc3e62d6ed7d9c) balance: " +
        oracleVal.toString() +
        "\n";
    }
    if (Number(permissionlessOracleVal) < 1) {
      message +=
        "permissionless oracle (0xef84c318543882400c4498c81759e18084a1a5f820bfc683e6f53e3daeb449e2) balance: " +
        permissionlessOracleVal.toString();
    }
    if (message.length > 0) {
      await pager.sendPage({
        message: "FUND INFRA",
        balances: message,
      });
    }
  } catch (e: any) {
    await pager.sendPage({
      message: "Pager failure",
      error: e.stack.toString(),
    });
  }
  return;
};

export const checkAptosFeed = async (
  address: string,
  network: string,
  minTillStale: number,
  targetPrice?: number,
  varianceThreshold?: number
) => {
  const pager = new Pager(
    configList.aptos[network].pdKey,
    `Aptos ${network} Alert v2: `,
    "aptos",
    network
  );
  const pid = configList.aptos[network].pid;
  const nodeUrl = configList.aptos[network].rpc;
  try {
    let result;
    if (targetPrice && varianceThreshold) {
      result = JSON.stringify(
        await checkFeedHealth(
          address,
          minTillStale,
          pid,
          nodeUrl,
          pager,
          targetPrice,
          varianceThreshold
        )
      );
    } else {
      result = JSON.stringify(
        await checkFeedHealth(address, minTillStale, pid, nodeUrl, pager)
      );
    }
    return result;
  } catch (e: any) {
    console.error(e);
    await pager.sendPage({
      message: "Pager failure",
      error: e.stack.toString(),
    });
    return e.stack.toString();
  }
};

// async function testPager() {
//   await checkAptosFeed(
//     "0xc07d068fe17f67a85147702359b5819d226591307a5bb54139794f8931327e88",
//     "testnet",
//     10
//   );
// }

// (async () => {
//   await testPager();
// })();
