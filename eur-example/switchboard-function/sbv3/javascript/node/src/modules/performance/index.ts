/** Monitor the Oracle's Node.JS performance
 * By default, simple blocked hook is used
 * - records time at the start of each tick
 * - only measures the latency between ticks
 * - tick size dependent on async load, so low activity could skew metrics
 * Use process.env.ADVANCED_EVENT_MONITORING to enable async blocking monitoring
 * - increases resource consumption
 * - uses Node.JS async hooks to record the beginning and end of async tasks
 */

import { extractIntegerEnvVar } from "../../utils/env.js";
import { NodeEvents } from "../events/index.js";
import { ConsoleLogger, NodeLogger } from "../logging/index.js";

import dotenv from "dotenv";
dotenv.config();

const DEFAULT_EVENT_LOOP_BLOCKED_ERROR_THRESHOLD = 250 * 1_000_000;

export class NodePerformance {
  private static instance: NodePerformance;
  public static getInstance(): NodePerformance {
    if (!NodePerformance.instance) {
      NodePerformance.instance = new NodePerformance();
    }

    return NodePerformance.instance;
  }

  // env
  private lastEventStalenessThreshold: number | undefined;
  private lastResponseStalenessThreshold: number | undefined;
  private eventLoopBlockedErrorThreshold: number | undefined;

  // event loop block
  public start: bigint = 0n;
  numErrors = 0;
  numWarnings = 0;
  public blockedTimer?: NodeJS.Timer;

  // stall check
  public lastEvent: number = 0;
  public lastResponse: number = 0;

  private constructor() {
    // parse env variables
    this.lastEventStalenessThreshold = extractIntegerEnvVar(
      "LAST_EVENT_STALENESS_THRESHOLD"
    );
    if (
      this.lastEventStalenessThreshold &&
      this.lastEventStalenessThreshold < 0
    ) {
      this.lastEventStalenessThreshold = undefined;
    }
    this.lastResponseStalenessThreshold = extractIntegerEnvVar(
      "LAST_RESPONSE_STALENESS_THRESHOLD"
    );
    this.eventLoopBlockedErrorThreshold = extractIntegerEnvVar(
      "EVENT_LOOP_STALL_THRESHOLD"
    );
    if (
      this.eventLoopBlockedErrorThreshold &&
      this.eventLoopBlockedErrorThreshold > 0
    ) {
      this.eventLoopBlockedErrorThreshold =
        this.eventLoopBlockedErrorThreshold * 1_000_000;
      // this.eventLoopBlockedWarningThreshold =
      //   this.eventLoopBlockedErrorThreshold * 0.5;
    }

    // if event staleness enabled, start event listener
    if (this.lastEventStalenessThreshold) {
      NodeEvents.getInstance().onNewEvent((eventName, timestamp) => {
        this.lastEvent = timestamp;
      });
    }
    if (this.lastResponseStalenessThreshold) {
      NodeEvents.getInstance().onNewEvent((eventName, timestamp) => {
        this.lastResponse = timestamp;
      });
    }
  }

  get eventLoopErrorThreshold(): number {
    return (
      this.eventLoopBlockedErrorThreshold ??
      DEFAULT_EVENT_LOOP_BLOCKED_ERROR_THRESHOLD
    );
  }

  get eventLoopWarningThreshold(): number {
    return this.eventLoopErrorThreshold * 0.5;
  }

  /** Enable when we are ready */
  public enable(): void {
    NodeLogger.getInstance().info(
      `Using default performance monitoring`,
      "EventLoopMonitor"
    );
    // start the performance metrics
    this.start = process.hrtime.bigint();
    this.blockedTimer = setInterval(() => {
      // first, check event loop blocked
      setImmediate(() => {
        const delta = process.hrtime.bigint() - this.start;
        const lagNs = Number(delta - BigInt(1e9));

        // NodeMetrics.getInstance()?.recordEventLoopLatency(lagNs / 1e6);

        if (lagNs > this.eventLoopErrorThreshold) {
          this.onError(lagNs);
        } else if (lagNs > this.eventLoopWarningThreshold) {
          this.onWarning(lagNs);
        } else {
          this.onSuccess(lagNs);
        }

        this.start = process.hrtime.bigint();
      });

      // then, check if we have received any events
      if (
        this.lastEventStalenessThreshold &&
        this.lastEvent &&
        Date.now() - this.lastEvent > this.lastEventStalenessThreshold * 1000
      ) {
        NodeEvents.getInstance().stalled(
          `Stalled, last event received ${Math.round(
            (Date.now() - this.lastEvent) / 1000
          ).toFixed(3)} second(s) ago (${
            this.lastEventStalenessThreshold
          } second threshold)`
        );
      }
      if (
        this.lastResponseStalenessThreshold &&
        this.lastResponse &&
        Date.now() - this.lastResponse >
          this.lastResponseStalenessThreshold * 1000
      ) {
        NodeEvents.getInstance().stalled(
          `Stalled, last response sent ${Math.round(
            (Date.now() - this.lastResponse) / 1000
          ).toFixed(3)} second(s) ago (${
            this.lastResponseStalenessThreshold
          } second threshold)`
        );
      }
    }, 1000).unref(); // dont hold up closing NodeJS for this timer
  }

  private onError = (ns: number) => {
    const time = ns / 1e6; // ms
    this.numErrors++;

    const message = `Event loop blocked for ${time}ms / ${
      this.eventLoopErrorThreshold / 1e6
    } (${this.numErrors})`;

    NodeLogger.getInstance().logger.warn({
      label: "EventLoopMonitor",
      id: "EventLoopMonitor",
      message: message,
      metadata: {
        time,
      },
    });
    if (process.env.DEBUG) {
      ConsoleLogger.red(`ERROR: ${message}`);
    }

    if (this.eventLoopBlockedErrorThreshold && this.numErrors > 3) {
      NodeEvents.getInstance().stalled(message);
    }
  };

  private onWarning = (ns: number) => {
    const time = ns / 1e6; // ms
    this.numWarnings++;

    const message = `Event loop blocked for ${time}ms / ${
      this.eventLoopWarningThreshold / 1e6
    } (${this.numWarnings})`;

    NodeLogger.getInstance().logger.warn({
      label: "EventLoopMonitor",
      id: "EventLoopMonitor",
      message: message,
      metadata: {
        time,
      },
    });
    if (process.env.DEBUG) {
      ConsoleLogger.yellow(`WARNING: ${message}`);
    }
  };

  private onSuccess = (ns: number) => {
    const time = ns / 1e6; // ms

    const message = `Event loop recovered ${time}ms`;

    if (this.numErrors > 0 || this.numWarnings > 0) {
      NodeLogger.getInstance().logger.info({
        label: "EventLoopMonitor",
        id: "EventLoopMonitor",
        message: message,
        metadata: {
          time,
        },
      });
      if (process.env.DEBUG) {
        ConsoleLogger.green(`INFO: ${message}`);
      }

      this.numErrors = 0;
      this.numWarnings = 0;
    }
  };
}
