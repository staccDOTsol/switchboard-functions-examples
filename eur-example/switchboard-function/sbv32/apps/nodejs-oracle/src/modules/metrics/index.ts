import { NodeEnvironment } from "../../env/NodeEnvironment";
import { VERSION } from "../../version";
import type { TaskRunnerResult } from "../task-runner";

import type { Span, Tracer } from "@opentelemetry/api";
import { trace } from "@opentelemetry/api";
import type {
  Counter,
  Histogram,
  ObservableGauge,
} from "@opentelemetry/api-metrics";
import { ValueType } from "@opentelemetry/api-metrics";
import { CollectorMetricExporter } from "@opentelemetry/exporter-collector";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { HostMetrics } from "@opentelemetry/host-metrics";
import type { Meter, MetricExporter } from "@opentelemetry/sdk-metrics-base";
import { MeterProvider } from "@opentelemetry/sdk-metrics-base";
import { NodeLogger } from "@switchboard-xyz/node/logging";

export const DEFAULT_LABELS: Record<string, string> = {
  //client: os.hostname(),
  chain: process.env.CHAIN!,
  cluster: process.env.CLUSTER!,
  imageID: VERSION!,
  oracleKey: process.env.ORACLE_KEY!,
};

export interface INodeMetrics {
  // switchboard_heartbeat_failure
  heartbeatFailure(error: any): void;
  // switchboard_node_aggregation_insufficient_responses
  jobAggregationFailure(labels?: Record<string, any>): void;
  // switchboard_unexpected_error
  unexpectedError(): void;
  // switchboard_job_posting
  // count total number of job postings that node attempts to perform"
  jobPosting(): void;
  // switchboard_job_success
  jobSuccess(): void;
  // switchboard_job_failure
  jobFailure(): void;
  // switchboard_save_result_failure
  saveResultFailure(): void;
  // jupiter_api_failure
  jupiterApiFailure(): void;
  // switchboard_vrf_request_success
  vrfRequestSuccess(): void;
  // switchboard_vrf_request_nonce_failure
  vrfRequestNonceFailure(): void;
  // switchboard_vrf_request_failure
  vrfRequestFailure(): void;
  // switchboard_nonce_failure
  nonceFailure(nonceAccount: string): void;
  // switchboard_nonce_interval
  // interval for how often a nonce is re-requested
  recordNonceInterval(value: number): void;
  // switchboard_aggregator_variances
  // the difference between the min and max values provided to the aggregator for a given job
  recordAggregatorVariance(value: number): void;
  // switchboard_total_latency
  // total latency counter
  recordLatency(): void;
  // switchboard_log_age
  // number of milliseconds since last log update
  recordLogAge(value: number): void;
  // event_loop_latency
  // number of milliseconds behind that the event loop took to process our setTimeout promise
  recordEventLoopLatency(value: number): void;

  recordFeedUpdateTimeDelay(value: number): void;

  recordTaskLatency(value: number, jobId: string, taskType: string): void;

  recordSuccessfulJobLatency(value: number): void;
}

export class NodeMetrics implements INodeMetrics {
  private static instance?: NodeMetrics;

  defaultLabels: Record<string, string>;
  exporterType: "prometheus" | "opentelemetry-collector" = "prometheus";
  exporter: CollectorMetricExporter | PrometheusExporter;
  meterProvider: MeterProvider;
  meter: Meter;
  hostMetrics: HostMetrics;
  VarianceCache: Map<string, number> = new Map();
  RoundAgeCache: Map<string, number> = new Map();

  // counters
  heartbeatErrorCounter: Counter;
  openRoundErrorCounter: Counter;
  aggregationErrorCounter: Counter;
  unexpectedErrorCounter: Counter;
  jobPostingCounter: Counter;
  jobSuccessCounter: Counter;
  jobFailureCounter: Counter;
  saveResultFailureCounter: Counter;
  jupiterApiFailureCounter: Counter;
  vrfRequestSuccessCounter: Counter;
  vrfRequestNonceFailureCounter: Counter;
  vrfRequestFailureCounter: Counter;
  nonceFailureCounter: Counter;
  totalLatencyCounter: Counter;
  recordBootTimeCounter: Counter;

  // recorders
  aggregationVarianceRecorder: ObservableGauge;
  roundAgeRecorder: ObservableGauge;
  logAgeRecorder: Histogram;
  nonceIntervalRecorder: Histogram;
  eventLoopLatency: Histogram;
  feedUpdateTimeDelay: Histogram;
  taskLatency: ObservableGauge;
  successfulJobLatency: Histogram;

  // tracers
  jobTracer: Tracer;
  eventLoopBlockedTracer: Tracer;

  priceChangeRecorder: ObservableGauge;
  PriceChangeCache: Map<string, number> = new Map();
  priceRecorder: ObservableGauge;
  PriceCache: Map<string, number> = new Map();
  jobResultRecorder: ObservableGauge;
  jobResultCache: Map<string, Map<string, number>> = new Map();
  taskTypeMap: Map<string, number> = new Map();
  lastTxRecorder: ObservableGauge;
  lastTxTime: number = 0;
  lastCrankPopRecorder: ObservableGauge;
  lastCrankPop: number = 0;

  public static getInstance(): NodeMetrics | undefined {
    // disable metrics for localnet
    const env = NodeEnvironment.getInstance();
    if (env.DISABLE_METRICS || env.isLocalnet) {
      return undefined;
    }

    if (!NodeMetrics.instance) {
      NodeMetrics.instance = new NodeMetrics();
    }

    return NodeMetrics.instance;
  }

  private constructor(defaultLabels = DEFAULT_LABELS) {
    this.defaultLabels = defaultLabels;

    switch (process.env.METRICS_EXPORTER) {
      case "gcp": {
        throw new Error("MetricsExporterNoLongerSupportedError");
      }
      case "opentelemetry-collector": {
        this.exporterType = "opentelemetry-collector";
        this.exporter = new CollectorMetricExporter();
        break;
      }
      case "prometheus":
      default: {
        this.exporterType = "prometheus";
        this.exporter = new PrometheusExporter({
          port: NodeEnvironment.getInstance().METRICS_EXPORTER_PORT,
          //   startServer: true,
        });
        break;
      }
    }

    this.meterProvider = new MeterProvider({
      exporter: this.exporter as MetricExporter,
      interval: 60_000,
    });
    this.meter = this.meterProvider.getMeter("switchboard-oracle");

    this.hostMetrics = new HostMetrics({
      meterProvider: this.meterProvider,
      name: "oracle-host-metrics",
    });

    // counters
    this.heartbeatErrorCounter = this.meter.createCounter(
      "switchboard_heartbeat_failure",
      {
        valueType: ValueType.INT,
        description: "count total number of heartbeat failures",
      }
    );
    this.openRoundErrorCounter = this.meter.createCounter(
      "switchboard_open_round_failure",
      {
        valueType: ValueType.INT,
        description: "count total number of open round failures",
      }
    );
    this.aggregationErrorCounter = this.meter.createCounter(
      "switchboard_node_aggregation_insufficient_responses",
      {
        valueType: ValueType.INT,
        description:
          "count total number of insufficient number of responses for response aggrigation",
      }
    );
    this.unexpectedErrorCounter = this.meter.createCounter(
      "switchboard_unexpected_error",
      {
        valueType: ValueType.INT,
        description: "count total number of unexpected errors",
      }
    );
    this.jobPostingCounter = this.meter.createCounter(
      "switchboard_job_posting",
      {
        valueType: ValueType.INT,
        description:
          "count total number of job postings that node attempts to perform",
      }
    );
    this.jobSuccessCounter = this.meter.createCounter(
      "switchboard_job_success",
      {
        valueType: ValueType.INT,
        description: "count total number of jobs successfully completed",
      }
    );
    this.jobSuccessCounter = this.meter.createCounter(
      "switchboard_job_success",
      {
        valueType: ValueType.INT,
        description: "count total number of jobs successfully completed",
      }
    );
    this.jobFailureCounter = this.meter.createCounter(
      "switchboard_job_failure",
      {
        valueType: ValueType.INT,
        description:
          "count total number of jobs which completed unsuccessfully",
      }
    );
    this.saveResultFailureCounter = this.meter.createCounter(
      "switchboard_save_result_failure",
      {
        valueType: ValueType.INT,
        description: "count total number of saveResult tx failures",
      }
    );
    this.jupiterApiFailureCounter = this.meter.createCounter(
      "jupiter_api_failure",
      {
        valueType: ValueType.INT,
        description: "count total number of jupiter API failures",
      }
    );
    this.vrfRequestSuccessCounter = this.meter.createCounter(
      "switchboard_vrf_request_success",
      {
        valueType: ValueType.INT,
        description: "count total number of succesful VRF requests",
      }
    );
    this.vrfRequestNonceFailureCounter = this.meter.createCounter(
      "switchboard_vrf_request_nonce_failure",
      {
        valueType: ValueType.INT,
        description: "count total number of failed VRF requests",
      }
    );
    this.vrfRequestFailureCounter = this.meter.createCounter(
      "switchboard_vrf_request_failure",
      {
        valueType: ValueType.INT,
        description: "count total number of failed VRF requests",
      }
    );
    this.nonceFailureCounter = this.meter.createCounter(
      "switchboard_nonce_failure",
      {
        valueType: ValueType.INT,
        description: "count total number of nextNonce failures",
      }
    );
    this.totalLatencyCounter = this.meter.createCounter(
      "switchboard_total_latency",
      {
        valueType: ValueType.DOUBLE,
        description: "total latency counter",
      }
    );
    this.recordBootTimeCounter = this.meter.createCounter(
      "switchboard_node_boot_time",
      {
        valueType: ValueType.INT,
        description: "Track oracle boot timestamps and restarts",
      }
    );

    // recorders
    this.aggregationVarianceRecorder = this.meter.createObservableGauge(
      "switchboard_aggregator_variances",
      {
        valueType: ValueType.DOUBLE,
        description:
          "the difference between the min and max values provided to the aggregator for a given job",
      },
      (observerResult) => {
        for (const [key, val] of this.VarianceCache) {
          observerResult.observe(val, {
            feedName: key,
          });
        }
        this.VarianceCache.clear();
      }
    );

    this.roundAgeRecorder = this.meter.createObservableGauge(
      "switchboard_round_age",
      {
        valueType: ValueType.DOUBLE,
        description:
          "the difference between the roundConfirmationTimestamp of the latest confirmed round and the one immediately prior to that",
      },
      (observerResult) => {
        for (const [key, val] of this.RoundAgeCache) {
          observerResult.observe(val, {
            feedName: key,
          });
        }
        this.RoundAgeCache.clear();
      }
    );
    this.priceChangeRecorder = this.meter.createObservableGauge(
      "switchboard_price_change",
      {
        valueType: ValueType.DOUBLE,
        description:
          "the difference between the roundConfirmationTimestamp of the latest confirmed round and the one immediately prior to that",
      },
      (observerResult) => {
        for (const [key, val] of this.PriceChangeCache) {
          observerResult.observe(val, {
            feedName: key,
          });
        }
        this.PriceChangeCache.clear();
      }
    );
    this.priceRecorder = this.meter.createObservableGauge(
      "switchboard_price",
      {
        valueType: ValueType.DOUBLE,
        description:
          "the difference between the roundConfirmationTimestamp of the latest confirmed round and the one immediately prior to that",
      },
      (observerResult) => {
        for (const [key, val] of this.PriceCache) {
          observerResult.observe(val, {
            feedName: key,
          });
        }
        this.PriceCache.clear();
      }
    );
    this.jobResultRecorder = this.meter.createObservableGauge(
      "switchboard_job_result",
      {
        valueType: ValueType.DOUBLE,
        description:
          "the difference between the roundConfirmationTimestamp of the latest confirmed round and the one immediately prior to that",
      },
      (observerResult) => {
        for (const [key, jobs] of this.jobResultCache) {
          for (const [jobName, jobResult] of jobs) {
            observerResult.observe(jobResult, {
              feedName: key,
              jobName: jobName,
            });
          }
        }
        this.jobResultCache.clear();
      }
    );
    this.lastTxRecorder = this.meter.createObservableGauge(
      "switchboard_last_tx_unix_time",
      {
        valueType: ValueType.INT,
        description: "the unix time in seconds of the last send tx",
      },
      (observerResult) => {
        observerResult.observe(this.lastTxTime, {});
      }
    );
    this.lastCrankPopRecorder = this.meter.createObservableGauge(
      "switchboard_last_crankpop_unix_time",
      {
        valueType: ValueType.INT,
        description: "the unix time in seconds of the last send crank pop",
      },
      (observerResult) => {
        observerResult.observe(this.lastCrankPop, {});
      }
    );

    this.logAgeRecorder = this.meter.createHistogram("switchboard_log_age", {
      valueType: ValueType.DOUBLE,
      description: "number of milliseconds since last log update",
    });
    this.nonceIntervalRecorder = this.meter.createHistogram(
      "switchboard_nonce_interval",
      {
        valueType: ValueType.DOUBLE,
        description: "interval for how often a nonce is re-requested",
      }
    );
    this.eventLoopLatency = this.meter.createHistogram("event_loop_latency", {
      valueType: ValueType.DOUBLE,
      description:
        "number of milliseconds of latency that the event loop took to process our timer",
    });
    this.feedUpdateTimeDelay = this.meter.createHistogram(
      "feed_update_time_delay",
      {
        valueType: ValueType.DOUBLE,
        description:
          "the difference between the expected updated time and the time at which the feed actually updates on-chain",
      }
    );
    this.taskLatency = this.meter.createObservableGauge("task_latency", {
      valueType: ValueType.INT,
      description:
        "the number of milliseconds to execute a given switchboard task",
    });
    this.successfulJobLatency = this.meter.createHistogram(
      "switchboard_successful_job_latency",
      {
        valueType: ValueType.INT,
        description: "number of milliseconds of latency for a successful job",
      }
    );
    // tracers
    this.jobTracer = trace.getTracer("switchboard-oracle", "1.0");
    this.eventLoopBlockedTracer = trace.getTracer("event-loop-blocked", "1.0");
  }

  heartbeatFailure(error: any) {
    this.heartbeatErrorCounter.add(1, this.defaultLabels);
  }
  openRoundFailure(error: any) {
    this.openRoundErrorCounter.add(1, this.defaultLabels);
  }
  jobAggregationFailure(labels?: Record<string, any>) {
    this.aggregationErrorCounter.add(1, { ...this.defaultLabels, ...labels });
  }
  unexpectedError() {
    this.unexpectedErrorCounter.add(1, this.defaultLabels);
  }
  recordBootTime() {
    this.recordBootTimeCounter.add(
      Math.floor(Date.now() / 1000),
      this.defaultLabels
    );
  }
  jobPosting() {
    this.jobPostingCounter.add(1, this.defaultLabels);
  }
  jobSuccess() {
    this.jobSuccessCounter.add(1, this.defaultLabels);
  }
  jobFailure() {
    this.jobFailureCounter.add(1, this.defaultLabels);
  }
  saveResultFailure() {
    this.saveResultFailureCounter.add(1, this.defaultLabels);
  }
  jupiterApiFailure() {
    this.jupiterApiFailureCounter.add(1, this.defaultLabels);
  }
  vrfRequestSuccess() {
    this.vrfRequestSuccessCounter.add(1, this.defaultLabels);
  }
  vrfRequestNonceFailure() {
    this.vrfRequestNonceFailureCounter.add(1, this.defaultLabels);
  }
  vrfRequestFailure() {
    this.vrfRequestSuccessCounter.add(1, this.defaultLabels);
  }
  nonceFailure(nonceAccount: string) {
    this.nonceFailureCounter.add(1, {
      ...this.defaultLabels,
      nonceAccount,
    });
  }
  recordLatency() {
    this.totalLatencyCounter.add(1, this.defaultLabels);
  }

  // recorders
  recordNonceInterval(value: number) {
    this.nonceIntervalRecorder.record(value);
  }
  recordAggregatorVariance(value: number) {
    this.aggregationVarianceRecorder.observation(value);
  }
  recordLogAge(value: number) {
    this.logAgeRecorder.record(value);
  }
  recordEventLoopLatency(value: number): void {
    this.eventLoopLatency.record(value);
  }
  recordFeedUpdateTimeDelay(value: number): void {
    this.feedUpdateTimeDelay.record(value);
  }

  recordTaskLatency(value: number, jobId: string, taskType: string): void {
    this.taskLatency.observation(value, {
      jobId,
      taskType,
    });
  }

  recordSuccessfulJobLatency(value: number): void {
    this.successfulJobLatency.record(value);
  }

  // tracers
  startJobTracer(jobPubKey: string): Span {
    const span = this.jobTracer.startSpan(`oracle-produce-result`, {
      attributes: {
        jobPubKey,
      },
    });
    return span;
  }

  addEventLoopBlockTrace(time: number): void {
    const span = this.eventLoopBlockedTracer.startSpan(`event-loop-blocked`, {
      startTime: new Date().getTime() - time,
      attributes: {},
    });
    span.end();
  }

  handleNewRound(
    address: string,
    latestRoundOpenTimestamp: number,
    feedResult: TaskRunnerResult,
    currentTime = Math.round(Date.now() / 1000)
  ): void {
    try {
      // handle metrics
      const ageDiff = currentTime - latestRoundOpenTimestamp;
      NodeMetrics.getInstance()?.RoundAgeCache.set(
        address,
        Number.parseInt(ageDiff.toString())
      );

      if (feedResult?.max && feedResult?.min) {
        const variance = feedResult.max.div(feedResult.min);
        NodeMetrics.getInstance()?.VarianceCache.set(
          address,
          Number.parseFloat(variance.toString())
        );
      }
    } catch (error) {
      NodeLogger.getInstance().error(
        `Failed to send new round metrics, ${error}`
      );
    }
  }

  public static setLastCrankPop(timestamp = Date.now() / 1000) {
    const metrics = NodeMetrics.getInstance();
    if (metrics) {
      metrics.lastCrankPop = timestamp;
    }
  }

  public static setLastTx(timestamp = Date.now() / 1000) {
    const metrics = NodeMetrics.getInstance();
    if (metrics) {
      metrics.lastTxTime = timestamp;
    }
  }
}
