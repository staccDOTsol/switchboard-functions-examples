import type { BaseEnvironment } from "../../env/BaseEnvironment";
import { VERSION } from "../../version";
import type { TaskRunnerResult } from "../task-runner";
import { taskRunnerSuccess } from "../task-runner";

import { FeedResultQueue } from "./FeedResultQueue";
import { TransactionSignatureQueue } from "./TransactionSignatureQueue";

import type { ChainType } from "@switchboard-xyz/common";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import crypto from "crypto";
import { fetch } from "undici";

export class NodeTelemetry {
  private static instance: NodeTelemetry;

  private readonly signatureQueue: TransactionSignatureQueue;
  private readonly resultsQueue: FeedResultQueue;

  public static getInstance(): NodeTelemetry {
    if (!NodeTelemetry.instance) {
      NodeTelemetry.instance = new NodeTelemetry();
    }

    return NodeTelemetry.instance;
  }

  private constructor() {
    this.signatureQueue = new TransactionSignatureQueue();
    this.resultsQueue = new FeedResultQueue();
  }

  async sendTransactionSignature(
    signature: string,
    queuePubkey: string
  ): Promise<void> {
    // only start the routine when we receive a signature
    if (!this.signatureQueue.isActive) {
      await this.signatureQueue.start().then(() => {
        NodeLogger.getInstance().debug(
          `TxnSignatureTelemetry queue started`,
          "TxnSignatureTelemetry"
        );
      });
    }

    this.signatureQueue.push(signature, queuePubkey);
  }

  async sendVersionMetric(
    chain: ChainType,
    networkId: string,
    queuePubkey: string,
    oraclePubkey: string
  ): Promise<void> {
    try {
      await fetch(new URL("https://metrics.switchboard.xyz"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // timeout: 5000,
        body: JSON.stringify({
          version: VERSION,
          oraclePubkey: oraclePubkey,
          queue: queuePubkey,
          cluster: networkId,
          chain: chain,
        }),
        // agent: (parsedURL: URL) => {
        //   if (parsedURL.protocol === "http:") {
        //     return httpAgent;
        //   } else {
        //     return httpsAgent;
        //   }
        // },
      });
    } catch (error: any) {
      NodeLogger.getInstance().error(error.toString(), "Telemetry");
    }
  }

  async sendFeedResult(params: {
    environment: BaseEnvironment;
    signature: string;
    oracleAddress: string;
    aggregatorAddress: string;
    feedResult: TaskRunnerResult;
  }): Promise<void> {
    // If the metrics collection is marked disabled, do nothing.
    if (params.environment.DISABLE_METRICS) return;
    // This is expected to only be logged on TaskRunnerSuccess.
    else if (!taskRunnerSuccess(params.feedResult)) return;
    // Skip localnet.
    else if (params.environment.isLocalnet) return;

    this.resultsQueue.push({
      chain: params.environment.CHAIN,
      networkId: params.environment.NETWORK_ID,
      result: {
        feedAddress: params.aggregatorAddress,
        oracleAddress: params.oracleAddress,
        result: params.feedResult.median.toString(),
        results: params.feedResult.jobs.reduce<
          { jobAddress: string; jobHash: string; result: string }[]
        >((array, job) => {
          if ("result" in job) {
            // If the job was a success, hash the job definition and store the result.
            array.push({
              jobAddress: job.jobKey,
              jobHash: crypto
                .createHash("sha256")
                .update(JSON.stringify(job.job.toJSON()))
                .digest()
                .toString("hex"),
              result: job.result.toString(),
            });
          }
          return array;
        }, []),
        txHash: params.signature,
      },
    });
  }
}
