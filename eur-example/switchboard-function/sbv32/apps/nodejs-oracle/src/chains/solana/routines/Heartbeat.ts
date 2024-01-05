import { SolanaEnvironment } from "../../../env/SolanaEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import { Sgx } from "../../../modules/sgx";
import { NodeTelemetry } from "../../../modules/telemetry";
import type { SolanaOracleProvider } from "../oracle/OracleProvider";

import type { TransactionSignature } from "@solana/web3.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";

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
  retryInterval = 5000;

  constructor(
    readonly provider: SolanaOracleProvider,
    readonly heartbeatIntervalSec: number
  ) {
    super(heartbeatIntervalSec * 1000);
  }

  get env() {
    return SolanaEnvironment.getInstance();
  }

  routine = async () => {
    try {
      let heartbeatSig: TransactionSignature;
      if (Sgx.isInEnclave()) {
        heartbeatSig = await this.provider.teeHeartbeat();
      } else {
        heartbeatSig = await this.provider.heartbeat();
      }
      if (SolanaEnvironment.VERBOSE()) {
        NodeLogger.getInstance().debug(
          `HeartbeatSignature: ${heartbeatSig}`,
          "Heartbeat"
        );
      }
    } catch (error) {
      onHeartbeatFailure(error);
      NodeLogger.getInstance().error(
        `Oracle ${this.provider.oracleAccount.publicKey.toBase58()} on queue ${this.provider.queueAccount.publicKey.toBase58()}`
      );
    }

    if (
      !this.env.LOCALNET &&
      this.env.isSwitchboardQueue(
        this.provider.queueAccount.publicKey.toBase58()
      )
    ) {
      setTimeout(() => {
        NodeTelemetry.getInstance().sendVersionMetric(
          this.env.CHAIN,
          this.env.NETWORK_ID,
          this.provider.queueAccount.publicKey.toBase58(),
          this.provider.oracleAccount.publicKey.toBase58()
        );
      });
    }
  };
}
