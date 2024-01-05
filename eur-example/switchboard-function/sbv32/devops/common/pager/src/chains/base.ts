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

const baseMainnet = {
  chainId: 0,
  pushReciverAddress: "",
  url: "",
};
const baseTestnet = {
  chainId: 84531,
  pushReciverAddress: "0xC29aAabf235c1E71633fb7365E95772B97F425d7",
  url: "https://base-goerli.g.alchemy.com/v2/ClyZ4o3fVUGNs9BapqOvCoPLMEoOLfaQ",
};

const testnetProvider = new providers.JsonRpcProvider(
  baseTestnet.url,
  baseTestnet.chainId
);
const mainnetProvider = new providers.JsonRpcProvider(
  baseMainnet.url,
  baseMainnet.chainId
);

export async function baseAction(
  cluster: string,
  staleCap: number
): Promise<number> {
  let pushReceiver = getSwitchboardPushReceiver(
    baseTestnet.pushReciverAddress,
    testnetProvider
  );
  if (cluster.includes("mainnet")) {
    pushReceiver = getSwitchboardPushReceiver(
      baseMainnet.pushReciverAddress,
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
