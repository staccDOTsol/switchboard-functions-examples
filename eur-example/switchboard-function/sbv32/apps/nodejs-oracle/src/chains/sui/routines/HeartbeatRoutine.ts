import { NodeEnvironment } from "../../../env/NodeEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import { NodeTelemetry } from "../../../modules/telemetry";

import type { Keypair } from "@mysten/sui.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type {
  OracleAccount,
  OracleQueueAccount,
} from "@switchboard-xyz/sui.js";

async function onHeartbeatFailure(e) {
  NodeMetrics.getInstance()?.heartbeatFailure(e);
  NodeLogger.getInstance().warn(`Error: Heartbeat failure (${e})`);
  console.error(e);
}

export class HeartbeatRoutine extends SwitchboardRoutine {
  eventName = "Heartbeat";

  errorHandler = onHeartbeatFailure;
  successHandler = undefined;
  retryInterval = 0;

  constructor(
    readonly oracle: OracleAccount,
    readonly queue: OracleQueueAccount,
    readonly account: Keypair,
    readonly heartbeatIntervalSec: number
  ) {
    super(heartbeatIntervalSec * 1000);
  }

  routine = async () => {
    NodeLogger.getInstance().debug(
      `Initiating heartbeat using payer ${this.account
        .getPublicKey()
        .toSuiAddress()}`
    );
    const sig = await this.oracle.heartbeat(this.account, this.queue.address);
    NodeLogger.getInstance().debug(`Heartbeat Signature: ${sig}`);

    if (!NodeEnvironment.getInstance().LOCALNET) {
      setTimeout(async () => {
        return NodeTelemetry.getInstance().sendVersionMetric(
          NodeEnvironment.getInstance().CHAIN,
          NodeEnvironment.getInstance().NETWORK_ID,
          this.queue.address,
          this.oracle.address
        );
      });
    }
  };
}
