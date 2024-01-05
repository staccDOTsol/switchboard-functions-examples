// const ethers = require("ethers");
import { configList } from "./function";
import { Pager } from "./pager";

// import SWITCHBOARD_COREDAO_CONFIG from "../../../javascript/common/src/networks/coredao"
import { web3 } from "@coral-xyz/anchor";
import type { Aggregator } from "@switchboard-xyz/evm.js";
import {
  FunctionAccount,
  getSwitchboard,
  getSwitchboardPushReceiver,
  getSwitchboardPushReceiverFeeds,
  SwitchboardProgram,
} from "@switchboard-xyz/evm.js";
// https://www.npmjs.com/package/@google-cloud/secret-manager
// eslint-disable-next-line node/no-extraneous-import
import Big from "big.js";
import * as ethers from "ethers";
import { formatEther } from "ethers/lib/utils";
import { net, Web3 } from "web3";
// import { IChainNetworkConfig } from "@switchboard-xyz/common";
// const NODE_URL = "https://rpc.coredao.org/";
// "https://api.infstones.com/core/mainnet/56852b950678445da33434fa3539b274";

async function accountBalance(
  client: ethers.providers.JsonRpcProvider,
  address: string
): Promise<Number> {
  return new Big((await client.getBalance(address)).toString())
    .div(new Big(ethers.constants.WeiPerEther.toString()))
    .toNumber();
}

function getSwitchboardReceiver(nodeUrl: string, pid: string) {
  const provider = new ethers.providers.JsonRpcProvider(nodeUrl);
  const tmpWallet = ethers.Wallet.createRandom();
  const privateKey = tmpWallet.privateKey;
  const wallet = new ethers.Wallet(privateKey).connect(provider);

  return getSwitchboardPushReceiver(pid, provider);
}

async function checkFeedHealth(
  minTillStale: number,
  nodeurl: string,
  pid: string
): Promise<any> {
  console.log("getting feed");
  const reciever = getSwitchboardReceiver(nodeurl, pid);
  let feeds;
  const staleFeeds = [];
  const freshFeeds = [];
  try {
    feeds = await getSwitchboardPushReceiverFeeds(reciever);
    feeds.map(async (feed: Aggregator) => {
      const latestTime = JSON.parse(feed.latestResult.timestamp.toString());
      const threshold = Number(minTillStale * 60);
      const now = +new Date() / 1000;
      const staleness = ethers.BigNumber.from(
        Math.round(now) - Number(latestTime)
      ).toNumber();
      if (staleness > threshold) {
        staleFeeds.push({
          name: feed.name,
          address: feed.address,
          staleness: staleness,
        });
      } else {
        freshFeeds.push({
          name: feed.name,
          address: feed.address,
          staleness: staleness,
        });
      }
    });
  } catch (e) {
    console.error("error getting feeds:\n" + e);
  }
  // configList[chain][cluster].rpcs
  return {
    staleFeeds: staleFeeds,
    freshFeeds: freshFeeds,
    page: staleFeeds.length > 0,
  };
}

export const checkEvmFeeds = async (
  minTillStale: number,
  nodeUrl: string,
  pid: string,
  network: string,
  chain: string,
  leaseThreshold: number
) => {
  // const address = req.query.address!.toString();
  // const minTillStale = +(req.query.minTillStale ?? "10");
  const pager = new Pager(
    configList[chain][network].pdKey,
    `${chain} ${network} Alert v2: `,
    chain,
    network
  );
  const result = await checkFeedHealth(minTillStale, nodeUrl, pid);
  if (result.page) {
    await pager.sendPage({
      error: "stale feeds",
      staleFeeds: result.staleFeeds,
    });
  }
  return result;
};

export async function checkEvmBalance(
  network: string,
  address: string,
  chain: string
) {
  //example mainnet address  "0xee3920F1b40095578D40023Fd30e476E56CcF19C"
  const pdKey = configList.defaultPdKey[network];
  const rpcUrl = configList[chain][network].rpc;
  const pid = configList[chain][network].pid;

  try {
    const balance = await accountBalance(
      new ethers.providers.JsonRpcProvider(rpcUrl),
      address
    );
    console.log(`balance of ${address} is ${balance}`);
    return balance;
  } catch (e) {
    console.error("error checking balance: " + e);
    return "error: " + e;
  }
}

export async function checkEvmBalanceAndPage(
  network: string,
  address: string,
  threshold: Number,
  chain: string
) {
  const pager = new Pager(
    configList[chain][network].pdKey,
    `${chain} ${network} Alert v2: `,
    chain,
    network
  );
  const balance = await checkEvmBalance(network, address, chain);
  if (balance < threshold) {
    await pager.sendPage({
      error: "insufficient balance",
      address: address,
      balance: balance,
    });
  }
}

// export async function checkEvmRoutineBalance(address:string, chain: string, cluster: string){
//   const provider = await getProvider(chain, cluster);
// const switchboardProgram = await SwitchboardProgram.fromProvider(provider);
// const routineAccount = await sbv3.RoutineAccount.load(switchboardProgram, 'YOUR_ROUTINE_ACCOUNT_PUBKEY');
// // Convert the balance to ETH (or Core) - they both use 18 decimals, so this converstion works.
// const ethBalance = Number(formatEther(routineAccount.balance));

// }

async function getProvider(chain: string, cluster: string) {
  console.log(`getting provider: ${chain}-${cluster}`);
  const rpcs = configList[chain][cluster].rpcs;
  for (let i = 0; i < rpcs.length; i++) {
    console.log("trying ", rpcs[i]);
    const provider = new ethers.providers.JsonRpcProvider(rpcs[i]);
    try {
      const height = await provider.getBlockNumber();
      console.log("height: ", height);
      return provider;
    } catch (e) {
      console.error("faulting endpoint: ", rpcs[i]);
      await new Pager(
        configList.aptos[cluster].pdKey,
        `RPC failure`,
        "aptos",
        cluster
      ).sendPage({ endpoint: rpcs[i] });
    }
  }
  throw "no working RPC endpoints";
}

export async function fundEvmWallet(
  address: string,
  amount: Number,
  chain: string,
  network: string
) {
  const privateKey = process.env.EVM_WALLET_PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey);
  const provider = await getProvider(chain, network);
  const connectedWallet = wallet.connect(provider);

  const amountEth = ethers.utils.parseEther(amount.toString());

  try {
    const tx = await connectedWallet.sendTransaction({
      to: address,
      value: amountEth,
    });
    const receipt = await tx.wait();
    const blockHash = receipt.blockHash;
    const blockNumber = receipt.blockNumber;
    return { blockHash, blockNumber };
  } catch (e) {
    return { error: e };
  }
}
// export async function checkLease(chain: string, cluster: string, functionAddress: string, config: IChainNetworkConfig) {

export async function checkEvmLease(
  chain: string,
  cluster: string,
  functionAddress: string,
  threshold: number
) {
  const provider = await getProvider(chain, cluster);
  const WEI_PER_ETH = ethers.BigNumber.from("1000000000000000000");
  // const signer = ethers.Wallet.createRandom();
  const program = await SwitchboardProgram.load(
    provider,
    "0xf9BD4FA5152b029576F33565Afb676da98Dd0563" // Switchboard contract address
  );
  // let program = configList[chain][cluster].pid
  const functionAccount = await FunctionAccount.load(program, functionAddress);
  const latestBalance = functionAccount.data.balance.div(WEI_PER_ETH);
  console.log("balance: ", latestBalance.toNumber());
}

// checkEvmLease(
//   "coredao",
//   "testnet",
//   "0xbBe9A9154F57Cd51a6258b774aF54DE4014B6e8E",
//   10
// ).then();

// getProvider("coredao", "testnet").then();

// async function testPager() {
//   const minTillStale = +"10";
//   console.log("result:\n",
//     JSON.stringify(
//       await checkFeedHealth(
//         minTillStale,
//         configList.coredao["testnet"].rpc,
//         configList.coredao["testnet"].pid,
//       )
//     )
//   );
//   // await checkEvmBalance(
//   //   "mainnet",
//   //   "0xc275e9e9467EcE4494cC0A4d65375b8e2Fc0d3a8"
//   // );
//   return;
// };

// testPager().then(() => console.log("done"));
