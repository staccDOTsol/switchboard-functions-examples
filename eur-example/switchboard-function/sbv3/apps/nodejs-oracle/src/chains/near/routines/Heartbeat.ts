import { NodeEnvironment } from "../../../env/NodeEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import { NodeTelemetry } from "../../../modules/telemetry";
import type { NearActionBatchQueue } from "../NearActionBatchQueue";

import type { OracleAccount } from "@switchboard-xyz/near.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { FinalExecutionOutcome } from "near-api-js/lib/providers";

async function onHeartbeatFailure(e) {
  NodeMetrics.getInstance()?.heartbeatFailure(e);
  NodeLogger.getInstance().warn(`Error: Heartbeat failure (${e})`);
  console.error(e);
  // throw new Error("HeartbeatFailureError");
}

export class HeartbeatRoutine extends SwitchboardRoutine {
  eventName = "Heartbeat";

  errorHandler = onHeartbeatFailure;
  successHandler = undefined;
  retryInterval = 0;

  constructor(
    readonly oracleAccount: OracleAccount,
    readonly queue: NearActionBatchQueue,
    heartbeatIntervalSec: number
  ) {
    super(heartbeatIntervalSec * 1000);
  }

  routine = async () => {
    this.queue.send(
      "Heartbeat",
      "Heartbeat",
      this.oracleAccount.heartbeatAction(),
      async (_name: string, txnReceipt: FinalExecutionOutcome) => {
        NodeLogger.getInstance().debug(
          `Heartbeat signature: ${txnReceipt.transaction.hash}`
        );
      },
      async (_name: string, _txnReceipt: FinalExecutionOutcome) => {
        NodeLogger.getInstance().warn(`Heartbeat failure`);
      }
    );
    if (!NodeEnvironment.getInstance().LOCALNET) {
      setTimeout(async () => {
        return NodeTelemetry.getInstance().sendVersionMetric(
          NodeEnvironment.getInstance().CHAIN,
          NodeEnvironment.getInstance().NETWORK_ID,
          await this.oracleAccount
            .loadData()
            .then((oracle) => oracle.queue.toString())
            .catch((_e) => ""),
          this.oracleAccount.address.toString()
        );
      });
    }
  };
}
