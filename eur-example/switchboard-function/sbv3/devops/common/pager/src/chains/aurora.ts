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

const auroraMainnet = {
  chainId: 1313161554,
  pushReciverAddress: "0x49a19751978F36c133D9cE26e61fab9795b5826B",
  url: "https://mainnet.aurora.dev/",
};
const auroraTestnet = {
  chainId: 1313161555,
  pushReciverAddress: "",
  url: "https://aurora-testnet.infura.io/v3/04755baf707e4b8288caba12502ad047",
};

const testnetProvider = new providers.JsonRpcProvider(
  auroraTestnet.url,
  auroraTestnet.chainId
);
const mainnetProvider = new providers.JsonRpcProvider(
  auroraMainnet.url,
  auroraMainnet.chainId
);

export async function auroraAction(
  cluster: string,
  staleCap: number
): Promise<number> {
  let pushReceiver = getSwitchboardPushReceiver(
    auroraTestnet.pushReciverAddress,
    testnetProvider
  );
  if (cluster.includes("mainnet")) {
    pushReceiver = getSwitchboardPushReceiver(
      auroraMainnet.pushReciverAddress,
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
