import { NodeEnvironment } from "../../env/NodeEnvironment";

import { NodeEvents } from "@switchboard-xyz/node/events";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import express from "express";
import type http from "http";

// TODO: https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/
export class NodeHealthCheck {
  private static instance: NodeHealthCheck;
  public static getInstance(): NodeHealthCheck {
    if (!NodeHealthCheck.instance) {
      NodeHealthCheck.instance = new NodeHealthCheck();
    }

    return NodeHealthCheck.instance;
  }

  isReady = false;
  isShutdown = false;

  server: http.Server;

  private constructor() {
    this.server = express()
      .get(["/healthz", "/health"], (req, res) => {
        if (this.isShutdown) {
          return res.status(503).send("Node is shutting down");
        }

        if (!this.isReady) {
          return res.status(503).send("Node is not ready");
        }

        return res.status(200).send("Node is healthy!");
      })
      .listen(NodeEnvironment.getInstance().HEALTH_CHECK_PORT, () => {
        NodeLogger.getInstance().info(
          `health check server initialized at /healthz on PORT ${
            NodeEnvironment.getInstance().HEALTH_CHECK_PORT
          }`,
          "HealthCheck"
        );
      });

    NodeEvents.getInstance().onReady(() => {
      this.isReady = true;
      NodeLogger.getInstance().info(
        `health check handler started`,
        "HealthCheck"
      );
    });

    NodeEvents.getInstance().onStalled(() => {
      this.isReady = false;
      this.isShutdown = true;
    });

    NodeEvents.getInstance().onKilled(() => {
      this.isReady = false;
      this.isShutdown = true;
      // prevent new incoming connections
      this.server.close(() => {
        NodeLogger.getInstance().info(
          `health check handler closed`,
          "HealthCheck"
        );
      });
      // // remove all existing connections
      // this.server.closeAllConnections();
    });
  }
}
