import { AptosCrank } from "../../chains/aptos/crank";
import { NearCrank } from "../../chains/near/crank";
import { SolanaCrank } from "../../chains/solana/crank";
import { NodeEnvironment } from "../../env/NodeEnvironment";
import { NodeHealthCheck } from "../../modules/health";
import type { SwitchboardApp } from "../../types";

import { Big } from "@switchboard-xyz/common";
import { PagerDuty } from "@switchboard-xyz/node/alerts/pager-duty";
import dotenv from "dotenv";

dotenv.config();

(async function main() {
  try {
    Big.DP = 40;

    // start http server but dont serve requests yet
    NodeHealthCheck.getInstance();

    const env = NodeEnvironment.getInstance();

    // load the crank by chain
    let crank: SwitchboardApp | undefined = undefined;
    switch (env.CHAIN) {
      case "solana": {
        crank = await SolanaCrank.load();
        break;
      }
      case "aptos": {
        crank = await AptosCrank.load();
        break;
      }
      case "near": {
        crank = await NearCrank.load();
        break;
      }
      // case "starknet": {
      //   const starknet = await StarknetOracle.load(taskRunner);
      //   return new SwitchboardCrank(env.CHAIN, starknet);
      // }
      // case "evm": {
      //   const core = await EVMOracle.load(taskRunner);
      //   return new SwitchboardCrank(env.CHAIN, core);
      // }
    }

    if (crank === undefined) {
      throw new Error(`Unable to find the crank for $CHAIN ${env.CHAIN}`);
    }

    await crank.start();
  } catch (e: any) {
    console.error(e);
    await PagerDuty.getInstance().sendEvent(
      "critical",
      "SwitchboardCriticalError: node shutting down.",
      {
        error: e.stack.toString(),
      }
    );

    // TODO: Throw a different code for RPC related errors to auto-reboot server without using k8s crash loop
    process.exit(1);
  }
})();
