import { ethers, providers } from "ethers";
import {
  AttestationQueueAccount,
  EnclaveAccount,
  FunctionAccount,
  Permissions,
  SwitchboardProgram,
  getSwitchboardPushReceiver,
} from "@switchboard-xyz/evm.js";
import moment from "moment-timezone";
const BigNumber = require("bignumber.js");
import Big from "big.js";

const optimismMainnet = {
  chainId: 10,
  pushReciverAddress: "",
  url: "https://mainnet.optimism.io",
};
const optimismTestnet = {
  chainId: 420,
  pushReciverAddress: "0xc9d804F1e904cA0912D46E0C02600f75563A4988",
  url: "https://goerli.optimism.io",
};

const testnetProvider = new providers.JsonRpcProvider(
  optimismTestnet.url,
  optimismTestnet.chainId
);
const mainnetProvider = new providers.JsonRpcProvider(
  optimismMainnet.url,
  optimismMainnet.chainId
);

export async function optimismAction(
  cluster: string,
  staleCap: number
): Promise<number> {
  let pushReceiver = getSwitchboardPushReceiver(
    optimismTestnet.pushReciverAddress,
    testnetProvider
  );
  if (cluster.includes("mainnet")) {
    pushReceiver = getSwitchboardPushReceiver(
      optimismMainnet.pushReciverAddress,
      mainnetProvider
    );
  }
  const divisor = new Big("1000000000000000000");
  const feeds = await pushReceiver.getAllFeeds();

  const now = new Date();
  feeds.map((feed) => {
    const feedName = ethers.utils.parseBytes32String(feed.feedName);
    const updateTime = new Date(feed.latestResult.updatedAt.toNumber() * 1000);
    console.log(
      feedName,
      feed.feedId.toString(),
      new Big(feed.latestResult.value.toString()).div(divisor).toString(),
      moment(updateTime).tz("America/New_York").format("YYYY-MM-DD HH:mm:ss")
    );
  });
  const stalenessArr = feeds.map((feed) => {
    const updateTime = new Date(feed.latestResult.updatedAt.toNumber() * 1000);
    return (now.getTime() - updateTime.getTime()) / 1000;
  });
  console.log(Math.min(...stalenessArr));
  return Math.min(...stalenessArr);
}
