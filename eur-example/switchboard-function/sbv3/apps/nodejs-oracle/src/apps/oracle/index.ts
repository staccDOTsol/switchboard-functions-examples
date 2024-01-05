import { AptosOracle } from "../../chains/aptos/oracle";
import { EVMOracle } from "../../chains/evm/oracle";
import { NearOracle } from "../../chains/near/oracle";
import { SolanaOracle } from "../../chains/solana/oracle";
import { SuiOracle } from "../../chains/sui/oracle";
import { NodeEnvironment } from "../../env/NodeEnvironment";
import { NodeHealthCheck } from "../../modules/health";
import { NodeMetrics } from "../../modules/metrics";
import { SwitchboardTaskRunner } from "../../modules/task-runner";
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

    NodeMetrics.getInstance()?.hostMetrics.start();
    NodeMetrics.getInstance()?.recordBootTime();

    const env = NodeEnvironment.getInstance();

    const taskRunner = await SwitchboardTaskRunner.load();
    let oracle: SwitchboardApp | undefined = undefined;
    switch (env.CHAIN) {
      case "solana": {
        oracle = await SolanaOracle.load(taskRunner);
        break;
      }
      case "aptos": {
        oracle = await AptosOracle.load(taskRunner);
        break;
      }
      case "near": {
        oracle = await NearOracle.load(taskRunner);
        break;
      }
      case "arbitrum": {
        oracle = await EVMOracle.load(taskRunner, "arbitrum");
        break;
      }
      case "coredao": {
        oracle = await EVMOracle.load(taskRunner, "coredao");
        break;
      }
      case "sui": {
        oracle = await SuiOracle.load(taskRunner);
        break;
      }
    }
    if (oracle === undefined) {
      throw new Error(`Unable to find the oracle for $CHAIN ${env.CHAIN}`);
    }

    await oracle.start();
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
