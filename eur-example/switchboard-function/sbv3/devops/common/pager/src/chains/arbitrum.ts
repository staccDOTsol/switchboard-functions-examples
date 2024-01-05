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

const arbitrumMainnet = {
  chainId: 42161,
  url: "https://switchbo-switchbo-1652.mainnet.arbitrum.rpcpool.com/ffc1b5b6-bb04-4334-ac89-1034cd57e86e",
  pushReciverAddress: "0xeb28036e166D67e85CCB28E59407Ab09Eb494EC2",
};
const arbitrumTestnet = {
  pushReciverAddress: "0xDf8bed962Af2EA8E61F57B35294436dCc3eF80dd",
  chainId: 421613,
  url: "https://goerli-rollup.arbitrum.io/rpc",
};

const testnetProvider = new providers.JsonRpcProvider(
  arbitrumTestnet.url,
  arbitrumTestnet.chainId
);
const mainnetProvider = new providers.JsonRpcProvider(
  arbitrumMainnet.url,
  arbitrumMainnet.chainId
);

export async function arbitrumAction(
  cluster: string,
  staleCap: number
): Promise<number> {
  let pushReceiver = getSwitchboardPushReceiver(
    arbitrumTestnet.pushReciverAddress,
    testnetProvider
  );
  if (cluster.includes("mainnet")) {
    pushReceiver = getSwitchboardPushReceiver(
      arbitrumMainnet.pushReciverAddress,
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
