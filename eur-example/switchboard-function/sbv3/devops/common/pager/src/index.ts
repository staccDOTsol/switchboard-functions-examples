const promClient = require("prom-client");
import { solanaAction } from "./chains/solana";
import { arbitrumAction } from "./chains/arbitrum";
import { coredaoAction } from "./chains/coredao";
import { auroraAction } from "./chains/aurora";
import { optimismAction } from "./chains/optimism";
import { baseAction } from "./chains/base";
import { starknetAction } from "./chains/starknet";
import { sendPage } from "./utils";

function parseArgs(req: any): any {
  const chain = req?.query?.chain?.toString() ?? "solana";
  const chainId = +(req?.query?.chainId?.toString() ?? 1);
  const cluster = req?.query?.cluster?.toString() ?? "devnet";

  let url =
    "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14";
  if (cluster === "mainnet-beta") {
    url = "https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a";
  }
  const pubkey =
    req?.query?.receiver?.toString() ??
    "EF68PJkRqQu2VthTSy19kg6TWynMtRmLpxcMDKEdLC8t";

  const minEthValue = req?.query?.minEthValue
    ? BigInt(req?.query?.minEthValue)
    : 10_000_000_000_000_000n; // 0.01 ETH
  const stalenessLimit = +(req?.query?.minTillStale ?? 10) * 60;
  return {
    chain,
    chainId,
    cluster,
    url,
    receiver: pubkey,
    stalenessLimit,
    minEthValue,
  };
}

export interface PagerResult {
  shouldPage: boolean;
  account: string;
  amount: number;
  type: "balance" | "staleness";
  message: string;
}

export const pager = async (req: any, res: any) => {
  const {
    chain,
    chainId,
    cluster,
    url,
    receiver,
    stalenessLimit,
    minEthValue,
  } = parseArgs(req);
  let staleness = stalenessLimit;
  let pagerFailure = false;
  let err = null;
  let pagerResult: PagerResult | undefined;

  try {
    if (chain === "solana") {
      staleness = await solanaAction(url, cluster, receiver, stalenessLimit);
    } else if (chain === "arbitrum") {
      staleness = await arbitrumAction(cluster, stalenessLimit);
    } else if (chain === "coredao") {
      staleness = await coredaoAction(cluster, stalenessLimit);
    } else if (chain === "aurora") {
      staleness = await auroraAction(cluster, stalenessLimit);
    } else if (chain === "optimism") {
      staleness = await optimismAction(cluster, stalenessLimit);
    } else if (chain === "base") {
      staleness = await baseAction(cluster, stalenessLimit);
    } else if (chain === "starknet") {
      pagerResult = await starknetAction(minEthValue, stalenessLimit);
    } else {
      res?.send(`chain ${chain} not found`);
      return;
    }
  } catch (e: any) {
    console.log(e);
    pagerFailure = true;
    err = e;
  }

  if (pagerResult?.shouldPage === true) {
    console.log("Sending page");
    await sendPage(chain, receiver, cluster, pagerResult.message);
    res?.send(`PAGING: ${pagerResult.message}`);
  } else if (staleness >= stalenessLimit || pagerFailure === true) {
    console.log("Sending page");
    await sendPage(
      chain,
      receiver,
      cluster,
      `staleness ${staleness}; pagerFailure: ${pagerFailure}`
    );
    res?.send(
      `PAGING: staleness ${staleness} and limit ${stalenessLimit}; pagerFailure: ${pagerFailure}\n${err}`
    );
  } else {
    res?.send(`ok with staleness ${staleness} and limit ${stalenessLimit}`);
  }
};
