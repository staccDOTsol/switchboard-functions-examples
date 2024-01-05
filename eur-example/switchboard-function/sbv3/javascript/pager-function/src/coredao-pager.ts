/*
// const ethers = require("ethers");
import { configList } from "./function";
import { Pager } from "./pager";

import { web3 } from "@coral-xyz/anchor";
import { HttpFunction } from "@google-cloud/functions-framework/build/src/functions";
import { getSwitchboard } from "@switchboard-xyz/evm.js";
// https://www.npmjs.com/package/@google-cloud/secret-manager
// eslint-disable-next-line node/no-extraneous-import
import Big from "big.js";
import * as ethers from "ethers";
import { Web3 } from "web3";
const NODE_URL =
  "https://api.infstones.com/core/mainnet/56852b950678445da33434fa3539b274";

const SWITCHBOARD_ADDRESS = "0x73d6C66874e570f058834cAA666b2c352F1C792D";
async function accountBalance(
  client: ethers.JsonRpcProvider,
  address: string
): Promise<Number> {
  return new Big((await client.getBalance(address)).toString())
    .div(new Big(ethers.WeiPerEther.toString()))
    .toNumber();
}
function getSwitchboardProgram(nodeUrl: string, pid: string) {
  const provider = new ethers.JsonRpcProvider(nodeUrl);
  const tmpWallet = ethers.Wallet.createRandom();
  const privateKey = tmpWallet.privateKey;
  const wallet = new ethers.Wallet(privateKey).connect(provider);
  // Argument of type 'Provider' is not assignable to parameter of type 'Signer | Provider'.
  // Type 'Provider' is missing the following properties from type 'Provider': getGasPrice, getStorageAt, getBlockWithTransactions, _isProviderts(2345)

  return getSwitchboard(pid, wallet.provider);
  // return getSwitchboard(pid, provider);
}

async function sendPage(aggregator: any, e: string, network: string) {
  const pager = new Pager(
    configList.coredao[network].pdKey,
    `CoreDAO ${network} Alert v2: `,
    "coredao",
    network
  );
  pager.sendPage({
    error: e,
    aggregator: aggregator,
  });
  // const customDetails = {
  //   group: "Default",
  //   error: e,
  //   aggregator: aggregator,
  //   url: NODE_URL,
  // };
  // const severity = "critical";
  // const payload = {
  //   payload: {
  //     summary: "CoreDAO Alert Mainnet: ",
  //     timestamp: new Date().toISOString(),
  //     source: aggregator.toString(),
  //     severity,
  //     group: "ABC",
  //     custom_details: customDetails,
  //   },
  //   routing_key: routingKey,
  //   event_action: "trigger",
  //   client: "Default",
  // };
  // console.log("Event sending to pagerduty:", payload);
  // await pdClient.events.sendEvent(payload);
}

async function checkFeedHealth(
  address: string,
  minTillStale: number,
  nodeurl: string,
  pid: string,
  network: string
): Promise<any> {
  const sb = getSwitchboardProgram(nodeurl, pid);
  const feed = await sb.aggregators(address);
  //Property 'BigNumber' does not exist on type 'typeof import("/home/scottk/workspace/switchboard/pager-function/node_modules/ethers/lib.commonjs/index")'.ts(2339)s
  // const threshold = ether.getBigInt(Number(minTillStale * 60))
  // const now = +new Date() / 1000;
  // const staleness = ether.getBigInt(
  //   Math.round(now) - Number(feed.latestResult.timestamp)
  // );
  const threshold = Number(minTillStale * 60);
  const now = +new Date() / 1000;
  const staleness = Math.round(now) - Number(feed.latestResult.timestamp);
  // const threshold = minTillStale * 60;
  let page = false;
  if (staleness > threshold) {
    page = true;
    await sendPage(address, "Feed is stale", network);
  }
  return { staleness, threshold, page };
}

export const checkCoredaoFeed = async (
  address: string,
  minTillStale: number,
  nodeUrl: string,
  pid: string,
  network: string
) => {
  // const address = req.query.address!.toString();
  // const minTillStale = +(req.query.minTillStale ?? "10");
  const pager = new Pager(
    configList.coredao[network].pdKey,
    `CoreDAO ${network} Alert v2: `,
    "coredao",
    network
  );
  try {
    const result = JSON.stringify(
      await checkFeedHealth(address, minTillStale, nodeUrl, pid, network)
    );

    // oracle for permissioned queue
    const oracleVal = await accountBalance(
      new ether.JsonRpcProvider(nodeUrl),
      "0xee3920F1b40095578D40023Fd30e476E56CcF19C"
    );

    // oracle for permissionless queue
    const permissionlessOracleVal = await accountBalance(
      new ether.JsonRpcProvider(nodeUrl),
      "0x17Cb220aE5AC496d4FC7fB2c9d33D2c6F52fc340"
    );
    let message = "";
    if (+oracleVal < 0.1) {
      message =
        "oracle (0xee3920F1b40095578D40023Fd30e476E56CcF19C) balance: " +
        oracleVal.toString() +
        "\n";
    }
    if (+permissionlessOracleVal < 0.1) {
      message +=
        "permissionless oracle (0x17Cb220aE5AC496d4FC7fB2c9d33D2c6F52fc340) balance: " +
        permissionlessOracleVal;
    }
    if (message.length > 0) {
      await pager.sendPage({ message: message });
    }
  } catch (e: any) {
    await pager.sendPage({ address: address, error: e.stack.toString() });
  }
  return;
};

export function checkCoredaoBalance(
  string,
  network: string,
  accountName: string
) {
  const pdKey = configList.defaultPdKey[network];
  const rpcUrl = configList.coredao[network].rpcUrl;
  const pid = configList.coredao[network].pid;
}

(async function main() {
  const address = "0x4846a57fE086DEf853Efb871114415d5A050C527";
  const minTillStale = +"10";
  console.log(
    JSON.stringify(
      await checkFeedHealth(
        address,
        minTillStale,
        NODE_URL,
        SWITCHBOARD_ADDRESS,
        "4"
      )
    )
  );
  return;
})();

*/
