import { AptosEnvironment } from "../../../env/AptosEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import { NodeTelemetry } from "../../../modules/telemetry";

import type { OracleAccount } from "@switchboard-xyz/aptos.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { AptosAccount } from "aptos";

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
    readonly oracle: OracleAccount,
    readonly account: AptosAccount,
    readonly heartbeatIntervalSec: number
  ) {
    super(heartbeatIntervalSec * 1000);
  }

  get env() {
    return AptosEnvironment.getInstance();
  }

  routine = async () => {
    NodeLogger.getInstance().debug(
      `Initiating heartbeat using payer ${this.account.address.toString()}`
    );
    const sig = await this.oracle.heartbeat(this.account);
    NodeLogger.getInstance().debug(`Heartbeat Signature: ${sig}`);

    if (!this.env.LOCALNET) {
      setTimeout(() => {
        NodeTelemetry.getInstance().sendVersionMetric(
          this.env.CHAIN,
          this.env.NETWORK_ID,
          this.account.address.toString(),
          this.oracle.address.toString()
        );
      });
    }
  };
}
