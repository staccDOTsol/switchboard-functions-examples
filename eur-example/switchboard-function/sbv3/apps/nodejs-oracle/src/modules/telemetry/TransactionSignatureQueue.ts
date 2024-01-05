import { NodeEnvironment } from "../../env/NodeEnvironment";

import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import { fetch } from "undici";

export interface TxnSignatureCacheItem {
  signature: string;
  timestamp: number;
  queuePubkey: string;
}

export class TransactionSignatureQueue extends SwitchboardRoutine {
  eventName = "SendTransactionSignature";

  errorHandler = async (error) => {
    NodeLogger.getInstance().error(
      `Failed to send signatures, ${error}`,
      "TxnSignatureTelemetry"
    );
  };
  successHandler = undefined;
  retryInterval = 0;

  signatures: Array<TxnSignatureCacheItem> = [];

  constructor() {
    super(60_000);
  }

  push(signature: string, queuePubkey: string) {
    if (this.signatures.length < 100) {
      this.signatures.push({
        signature,
        queuePubkey,
        timestamp: Math.round(Date.now() / 1000),
      });
    }
  }

  routine = async () => {
    if (this.signatures.length === 0) {
      return;
    }
    const signatures: Array<TxnSignatureCacheItem> = [...this.signatures];
    this.signatures = [];

    // const env = NodeEnvironment.getInstance();

    try {
      const response = await fetch(
        new URL("https://telemetry-function-f7ex2lkefq-uc.a.run.app"),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            signatures.map(({ signature, queuePubkey, timestamp }) => {
              return {
                txSig: signature,
                network: "solana",
                cluster: "mainnet-beta",
                queue: queuePubkey,
                timestamp: timestamp,
              };
            })
          ),
          // agent: (parsedURL: URL) => {
          //   if (parsedURL.protocol === "http:") {
          //     return httpAgent;
          //   } else {
          //     return httpsAgent;
          //   }
          // },
        }
      );

      if (!response.ok) {
        NodeLogger.getInstance().error(
          `Failed to send transaction signatures (${response.status} - ${response.statusText})`,
          "TxnSignatureTelemetry"
        );
        this.signatures.unshift(...signatures);
        return;
      }

      if (NodeEnvironment.getInstance().DEBUG) {
        NodeLogger.getInstance().debug(
          `Sent ${signatures.length} transaction signatures to telemetry database`,
          "TxnSignatureTelemetry"
        );
      }
    } catch (e: any) {
      NodeLogger.getInstance().error(e, "TxnSignatureTelemetry");
      if (NodeEnvironment.getInstance().VERBOSE) {
        console.error(e);
      }
      this.signatures.unshift(...signatures);
    }
  };
}
