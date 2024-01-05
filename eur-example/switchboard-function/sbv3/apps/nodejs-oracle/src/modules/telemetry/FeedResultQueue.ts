import { NodeEnvironment } from "../../env/NodeEnvironment";

import type { ChainType } from "@switchboard-xyz/common";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import { fetch } from "undici";

export interface FeedResultCacheItem {
  chain: ChainType;
  networkId: string;
  result: {
    oracleAddress: string;
    feedAddress: string;
    txHash: string;
    result: string;
    results: { jobAddress: string; jobHash: string; result: string }[];
  };
}

export class FeedResultQueue extends SwitchboardRoutine {
  eventName = "SendFeedResult";

  errorHandler = async (error) => {
    NodeLogger.getInstance().error(
      `Failed to send results, ${error}`,
      "FeedResultTelemetry"
    );
  };
  successHandler = undefined;
  retryInterval = 0;

  private results: Array<FeedResultCacheItem & { timestamp: number }> = [];
  private appUrl = NodeEnvironment.getInstance().TELEMETRY_FEED_RESULT_PUSH_URL;

  constructor() {
    super(NodeEnvironment.getInstance().TELEMETRY_FEED_RESULT_PUSH_INTERVAL_MS);

    if (!this.appUrl) {
      NodeLogger.getInstance().error(
        "Failed to start FeedResultTelemetry, no app URL",
        "FeedResultTelemetry"
      );
    }
  }

  async push(item: FeedResultCacheItem) {
    // If there is no app url, return before this routine can be made active.
    if (!this.appUrl) return;
    // Only start this routine once items start getting pushed.
    else if (!this.isActive) {
      await this.start().then(() => {
        NodeLogger.getInstance().debug(
          "FeedResultTelemetry queue started",
          "FeedResultTelemetry"
        );
      });
    }
    while (this.results.length > 100) this.results.shift();
    this.results.push({ ...item, timestamp: Date.now() });
  }

  routine = async () => {
    // Don't do anything if there aren't results to send.
    if (this.results.length === 0) return;

    const results: (typeof this.results)[number][] = [...this.results];
    this.results = [];
    try {
      const response = await fetch(new URL(this.appUrl), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(results),
      });

      if (!response.ok) {
        NodeLogger.getInstance().error(
          `Failed to send feed results (${response.status} - ${response.statusText})`,
          "FeedResultTelemetry"
        );
        this.results.unshift(...results);
        return;
      }

      if (NodeEnvironment.getInstance().DEBUG) {
        NodeLogger.getInstance().debug(
          `Sent ${results.length} feed results to telemetry database`,
          "FeedResultTelemetry"
        );
      }
    } catch (error: any) {
      NodeLogger.getInstance().error(error, "TxnSignatureTelemetry");
      NodeEnvironment.getInstance().VERBOSE && console.error(error);
      this.results.unshift(...results);
    }
  };
}
