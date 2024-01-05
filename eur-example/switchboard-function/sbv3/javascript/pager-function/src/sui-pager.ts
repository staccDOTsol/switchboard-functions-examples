/*

import { JsonRpcProvider, Connection } from "@mysten/sui.js";
import { AggregatorAccount } from "@switchboard-xyz/sui.js";
import { Pager } from "./pager";
import { HttpFunction } from "@google-cloud/functions-framework/build/src/functions";

// Environment Variables

// process.env.CLUSTER
// mainnet or testnet

// process.env.SWITCHBOARD_ADDRESS
// Mainnet Address:
// 0xfd2e0f4383df3ec9106326dcd9a20510cdce72146754296deed15403fcd3df8b
// Testnet Address:
// 0x271beaa1f36bf8812a778f0df5a7a9f67a757008512096862a128c42923671e2

// process.env.NODE_URL
// RPC Accounts:
// "https://mainnet.sui.rpcpool.com";
// "https://testnet.sui.rpcpool.com";

// process.env.PAGERDUTY_ROUTING_KEY
// Pagerduty Routing Key:
// Testnet
// 45ed6df85e544600c01702d353a5e708
// Mainnet
// dc6aa95f95d74b02c0b7c9e23d59cfcc

// process.env.ORACLES
// mainnet oracles:
// 0x44e30efa5808cec0ae75bafa6c9b5f2cc8b8bb34ec7602e037160f25d12d10b8,
// 0x4bbdd26b5ce9d2fb91e256ecd5ad94e0bfe8910af4e33ab8bebc75970911a7c0
// testnet oracles:
// 0xc9c8e0d738d7f090144847b38a8283fbe8050923875771b8c315a461721c04a4

const SWITCHBOARD_ADDRESS = process.env.SWITCHBOARD_ADDRESS;

async function accountBalance(
  client: JsonRpcProvider,
  address: string
): Promise<number> {
  const out = await client.getBalance({
    owner: address,
  });
  return Number(out.totalBalance) / 1_000_000_000;
}

async function sendPage(aggregator: any, e: string, isMainnet: boolean) {
  let routingKey = process.env.PAGERDUTY_ROUTING_KEY;
  let pdClient = new PdClient(routingKey);
  let customDetails = {
    group: "ABC",
    error: e,
    aggregator: aggregator,
  };
  let severity = "critical";
  let payload = {
    payload: {
      summary: `Sui ${isMainnet ? "Mainnet" : "Testnet"} Alert v2: `, //+ cluster.toString(),
      timestamp: new Date().toISOString(),
      source: aggregator.toString(),
      severity,
      group: "ABC", //cluster.toString(),
      custom_details: customDetails,
    },
    routing_key: routingKey,
    event_action: "trigger",
    client: "ABC",
  };
  console.log("Event sending to pagerduty:", payload);
  await pdClient.events.sendEvent(payload);
}

async function checkFeedHealth(
  address: string,
  minTillStale: number,
  client: JsonRpcProvider,
  isMainnet: boolean,
  pid: string,
  pager: Pager
): Promise<any> {
  const feedAccount = new AggregatorAccount(
    client, //Property 'unsubscribeEvent' is missing in type 'import("/home/scottk/workspace/switchboard/pager-function/node_modules/@mysten/sui.js/dist/providers/json-rpc-provider").JsonRpcProvider' but required in type 'import("/home/scottk/workspace/switchboard/pager-function/node_modules/@switchboard-xyz/sui.js/node_modules/@mysten/sui.js/dist/providers/json-rpc-provider").JsonRpcProvider
    address,
    pid
  );
  const feed = await feedAccount.loadData();
  const threshold = minTillStale * 60;
  const now = +new Date() / 1000;
  const staleness = now - parseInt(feed.update_data.fields.latest_timestamp);

  // const threshold = minTillStale * 60;
  let page = false;
  if (staleness > threshold) {
    page = true;
    await pager.sendPage(`Stale Feed (${staleness} seconds): `+address);
  }
  return { staleness, threshold, page };
}

export const checkSuiFeed = async (address: string, network: string, minTillStale: number, nodeUrl: string, pid: string, pdKey: string) => {
  const pager = new Pager(pdKey, "Sui " + network + " Alert:", "sui", network)

  try {
    const isMainnet = network === "mainnet";
    if (!nodeUrl) {
      throw new Error("NODE_URL env var not set");
    }
    const client = new JsonRpcProvider(
      new Connection({
        fullnode: nodeUrl,
      })
    );

    return JSON.stringify(await checkFeedHealth(address, minTillStale, client, isMainnet, pid, pager));

  } catch (e) {
    await pager.sendPage("Pager Error:\n"+e.stack.toString());
    console.error(`${e.stack.toString()}`);
  }
  return;
};

export const checkSuiBalance = async (address: string, network: string, accountName: string, nodeUrl: string, pdKey: string) => {
  const pager = new Pager(pdKey, "Sui " + network + " Alert:", "sui", network)
  const client = new JsonRpcProvider(
    new Connection({
      fullnode: nodeUrl,
    })
  );
  const oracles = process.env.ORACLES?.split(",");
  if (!oracles) {
    return;
  }
    const balance = await accountBalance(client, address);
    if (balance < 1) {
      await pager.sendPage(`${accountName} (${address}) needs funding (balance: ${balance.toString()})`);//sendPage("FUND", oracle, isMainnet);
    }


}

*/
