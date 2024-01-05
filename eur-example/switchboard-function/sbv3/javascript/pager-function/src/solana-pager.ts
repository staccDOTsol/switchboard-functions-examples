// const { CloudTasksClient } = require("@google-cloud/tasks");
// const promClient = require("prom-client");
import { configList } from "./function";
import { Pager } from "./pager";

import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/solana.js";
// import { HttpFunction } from "@google-cloud/functions-framework/build/src/functions";
// https://www.npmjs.com/package/@google-cloud/secret-manager
import * as bs58 from "bs58";

function toCluster(cluster: string): anchor.web3.Cluster {
  if (cluster === "mainnet") cluster = "mainnet-beta";
  switch (cluster) {
    case "devnet":
      return "devnet";
      break;
    case "testnet":
      return "testnet";
      break;
    case "mainnet-beta":
      return cluster;
      break;
  }
  throw new Error(`Invalid cluster type ${cluster}`);
}

/*
async function sendPage(
  aggregator: sbv2.AggregatorAccount,
  cluster: Cluster,
  e: string
) {
  let routingKey = "dc6aa95f95d74b02c0b7c9e23d59cfcc";
  if (cluster.toString().includes("devnet")) {
    routingKey = "faafe60385384309c077ed61303e50d0";
  }
  const aggregatorData = await aggregator.loadData();
  const [leaseAccount] = sbv2.LeaseAccount.fromSeed(
    aggregator.program,
    new sbv2.OracleQueueAccount({
      program: aggregator.program,
      publicKey: aggregatorData.queuePubkey,
    }),
    aggregator
  );
  const pdClient = new PdClient(routingKey);
  const customDetails = {
    group: cluster.toString(),
    feed: aggregator.publicKey.toString(),
    name: sbv2.AggregatorAccount.getName(aggregatorData),
    leaseBalance: await leaseAccount.getBalance(),
    error: e,
  };
  let severity = "critical";
  if (cluster.toString().includes("devnet")) {
    severity = "info";
  }
  const payload = {
    payload: {
      summary: "Feed Health Alert v2: " + cluster.toString(),
      timestamp: new Date().toISOString(),
      source: aggregator.publicKey.toString(),
      severity,
      group: cluster.toString(),
      custom_details: customDetails,
    },
    routing_key: routingKey,
    event_action: "trigger",
    client: aggregator.publicKey.toString(),
  };
  console.log("Event sending to pagerduty:", payload);
  await pdClient.events.sendEvent(payload);
}

*/
async function checkFeedHealth(
  program: sbv2.SwitchboardProgram,
  aggregatorPublicKey: anchor.web3.PublicKey,
  msTillStale: number,
  pager: Pager
) {
  // -------------
  // Type 'Program<Idl>' is not assignable to type 'SwitchboardProgram'.
  //   Types of property 'account' are incompatible.
  //     Type 'import("/home/scottk/workspace/switchboard/pager-function/node_modules/@project-serum/anchor/dist/cjs/program/namespace/account").AccountNamespace<import("/home/scottk/workspace/switchboard/pager-function/node_modules/@project-serum/anchor/dist/cjs/idl").Idl>' is not assignable to type 'import("/home/scottk/workspace/switchboard/pager-function/node_modules/@coral-xyz/anchor/dist/cjs/program/namespace/account").AccountNamespace<import("/home/scottk/workspace/switchboard/pager-function/node_modules/@coral-xyz/anchor/dist/cjs/idl").Idl>'.
  //       'string' index signatures are incompatible.
  //         Type 'import("/home/scottk/workspace/switchboard/pager-function/node_modules/@project-serum/anchor/dist/cjs/program/namespace/account").AccountClient<import("/home/scottk/workspace/switchboard/pager-function/node_modules/@project-serum/anchor/dist/cjs/idl").Idl, import("/home/scottk/workspace/switchboard/pager-function/no...' is not assignable to type 'import("/home/scottk/workspace/switchboard/pager-function/node_modules/@coral-xyz/anchor/dist/cjs/program/namespace/account").AccountClient<import("/home/scottk/workspace/switchboard/pager-function/node_modules/@coral-xyz/anchor/dist/cjs/idl").Idl, import("/home/scottk/workspace/switchboard/pager-function/node_modul...'.
  //           Types have separate declarations of a private property '_size'.ts(2322)
  // sbv2.d.ts(48, 5): The expected type comes from property 'program' which is declared here on type 'AccountParams'
  // ---------------
  const [aggregatorAccount, aggregatorData] = await sbv2.AggregatorAccount.load(
    program,
    aggregatorPublicKey
  );

  const latestRoundDate = new Date(
    sbv2.AggregatorAccount.decodeLatestTimestamp(aggregatorData)
      .muln(1_000)
      .toNumber()
  );
  const staleness = Date.now() - latestRoundDate.getTime();
  if (staleness > msTillStale) {
    await pager.sendPage({
      aggregator: aggregatorAccount.publicKey.toBase58(),
      message: "Feed is stale",
    });
  }
  return {
    staleness: staleness / 1000,
    aggregator: aggregatorPublicKey.toBase58(),
    page: staleness > msTillStale,
  };
}

export const checkSolana = async (
  address: string,
  network: string,
  minTillStale: number
) => {
  try {
    const cluster = toCluster(network);

    const result = await checkFeedHealth(
      /* program= */ await sbv2.SwitchboardProgram.fromConnection(
        new anchor.web3.Connection(configList.solana[cluster].rpc)
      ),
      /* aggregatorPublicKey= */ new anchor.web3.PublicKey(address),
      /* msTillStale= */ 60_000 * minTillStale,
      /* pager= */ new Pager(
        configList.solana[cluster].pdKey,
        `Solana ${cluster} Alert v2: `,
        "solana",
        cluster
      )
    );
    return result;
  } catch (e: any) {
    console.error(`${e.stack.toString()}`);
    return e;
  }
};

// checkSolana(
//   "8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee",
//   "mainnet-beta",
//   90
// ).then((result) => {
//   console.log(JSON.stringify(result));
//   return;
// });
