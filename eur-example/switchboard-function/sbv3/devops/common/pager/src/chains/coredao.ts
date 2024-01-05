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

const coredaoMainnet = {
  pushReciverAddress: "0xC29aAabf235c1E71633fb7365E95772B97F425d7",
  chainId: 1116,
  url: "https://rpc.coredao.org",
};
const coredaoTestnet = {
  pushReciverAddress: "0x4D06F949eb1057EB86446532eDf1cF323e787a8f",
  chainId: 1115,
  url: "https://rpc.test.btcs.network",
};

const testnetProvider = new providers.JsonRpcProvider(
  coredaoTestnet.url,
  coredaoTestnet.chainId
);
const mainnetProvider = new providers.JsonRpcProvider(
  coredaoMainnet.url,
  coredaoMainnet.chainId
);

export async function coredaoAction(
  cluster: string,
  staleCap: number
): Promise<number> {
  let pushReceiver = getSwitchboardPushReceiver(
    coredaoTestnet.pushReciverAddress,
    testnetProvider
  );
  if (cluster.includes("mainnet")) {
    pushReceiver = getSwitchboardPushReceiver(
      coredaoMainnet.pushReciverAddress,
      mainnetProvider
    );
  }
  const divisor = new BigNumber("1000000000000000000");
  const feeds = await pushReceiver.getAllFeeds();

  const now = new Date();
  feeds.map((feed) => {
    const feedName = ethers.utils.parseBytes32String(feed.feedName);
    const updateTime = new Date(feed.latestResult.updatedAt.toNumber() * 1000);
    console.log(
      feedName,
      feed.feedId.toString(),
      new BigNumber(feed.latestResult.value.toString())
        .dividedBy(divisor)
        .toString(),
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
