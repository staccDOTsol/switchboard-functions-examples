import { DEFAULT_COMMITMENT } from "../chains/solana/types";
import { VERSION } from "../version";

import { Connection, Keypair } from "@solana/web3.js";
import type { ChainType } from "@switchboard-xyz/common";
import { isSupportedChain, SWITCHBOARD_CHAINS } from "@switchboard-xyz/common";
import CommonPkg from "@switchboard-xyz/common/package.json";
import {
  extractBooleanEnvVar,
  extractNonNullableStringEnvVar,
  extractStringEnvVar,
  extractStringEnvVars,
} from "@switchboard-xyz/node";
import { AwsProvider } from "@switchboard-xyz/node/aws";
import { AzureProvider } from "@switchboard-xyz/node/azure";
import { DockerProvider } from "@switchboard-xyz/node/docker";
import { FsProvider } from "@switchboard-xyz/node/fs";
import { GcpProvider } from "@switchboard-xyz/node/gcp";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import TaskRunnerPkg from "@switchboard-xyz/task-runner/package.json";
import bs58 from "bs58";
import * as dotenv from "dotenv";
import fs from "fs";

dotenv.config();

export class BaseEnvironment {
  readonly CHAIN: ChainType;

  readonly DEBUG: boolean;

  readonly VERBOSE: boolean;

  readonly PAYER_SECRET: string;
  readonly FS_PAYER_SECRET_PATH: string;
  readonly DOCKER_PAYER_SECRET: string;
  readonly GOOGLE_PAYER_SECRET_PATH?: string;
  readonly AMAZON_PAYER_SECRET_PATH?: string;
  readonly AZURE_PAYER_SECRET_PATH?: string;

  readonly DISABLE_SMART_CRANK: boolean;

  readonly HEARTBEAT_INTERVAL: number;

  readonly TELEMETRY_FEED_RESULT_PUSH_INTERVAL_MS: number;
  readonly TELEMETRY_FEED_RESULT_PUSH_URL: string | undefined;

  readonly GCP_CONFIG_BUCKET: string | undefined;

  readonly AWS_CONFIG_BUCKET: string | undefined;

  readonly TASK_RUNNER_SOLANA_RPC: string | undefined;

  readonly DISABLE_METRICS: boolean;

  readonly METRICS_EXPORTER: "prometheus" | "opentelemetry-collector";

  PAGERDUTY_EVENT_KEY: string | undefined;

  readonly HEALTH_CHECK_PORT: number;

  readonly METRICS_EXPORTER_PORT: number;

  public NETWORK_ID: string = "";
  public LOCALNET = false;

  _mainnetSolanaConnection?: Connection;

  static variableProvided(key: string): boolean {
    return (
      key in process.env &&
      process.env[key] !== undefined &&
      process.env[key] !== ""
    );
  }

  static parseBoolean(key: string): boolean {
    return extractBooleanEnvVar(key);
  }

  public get isLocalnet(): boolean {
    return this.LOCALNET || this.NETWORK_ID === "localnet";
  }

  constructor() {
    // Chain Environment
    this.CHAIN = BaseEnvironment.getChain();

    // Task Runner Environment
    const taskRunnerConfig = BaseEnvironment.getTaskRunnerConfig();
    this.GCP_CONFIG_BUCKET = taskRunnerConfig.GCP_CONFIG_BUCKET;
    this.AWS_CONFIG_BUCKET = taskRunnerConfig.AWS_CONFIG_BUCKET;
    this.TASK_RUNNER_SOLANA_RPC = taskRunnerConfig.TASK_RUNNER_SOLANA_RPC;

    this.TELEMETRY_FEED_RESULT_PUSH_INTERVAL_MS = // default to 5 seconds
      Number(process.env.TELEMETRY_FEED_RESULT_PUSH_INTERVAL_MS ?? "5000");
    this.TELEMETRY_FEED_RESULT_PUSH_URL = // In the case of an empty string use undefined.
      process.env.TELEMETRY_FEED_RESULT_PUSH_URL || undefined;

    // Oracle Environment
    this.HEARTBEAT_INTERVAL = +(process.env.HEARTBEAT_INTERVAL ?? "30");

    // Crank Environment
    this.DISABLE_SMART_CRANK = extractBooleanEnvVar("DISABLE_SMART_CRANK");

    // Monitoring Environment
    this.HEALTH_CHECK_PORT = BaseEnvironment.getHealthCheckPort();
    this.PAGERDUTY_EVENT_KEY = BaseEnvironment.getPagerDutyKey();

    // Metrics Environment
    this.DISABLE_METRICS = extractBooleanEnvVar("DISABLE_METRICS");
    this.METRICS_EXPORTER = BaseEnvironment.getMetricsExporter();
    this.METRICS_EXPORTER_PORT = BaseEnvironment.getMetricsExporterPort();

    // Logging Environment
    this.DEBUG = BaseEnvironment.DEBUG();
    this.VERBOSE = BaseEnvironment.VERBOSE();

    // Secret Environment
    this.PAYER_SECRET =
      extractStringEnvVars(
        "PAYER_SECRET",
        `${this.CHAIN.toUpperCase()}_PAYER_SECRET`
      ) || "";
    this.FS_PAYER_SECRET_PATH =
      extractStringEnvVars(
        "PAYER_SECRET_PATH",
        "FS_PAYER_SECRET_PATH",
        `${this.CHAIN.toUpperCase()}_FS_PAYER_SECRET_PATH`
      ) || "../payer_secrets.json";
    this.DOCKER_PAYER_SECRET =
      extractStringEnvVars(
        "DOCKER_PAYER_SECRET",
        `${this.CHAIN.toUpperCase()}_DOCKER_PAYER_SECRET`
      ) || "PAYER_SECRETS";

    this.GOOGLE_PAYER_SECRET_PATH = extractStringEnvVars(
      "GOOGLE_PAYER_SECRET_PATH",
      `${this.CHAIN.toUpperCase()}_GOOGLE_PAYER_SECRET_PATH`
    );
    this.AMAZON_PAYER_SECRET_PATH = extractStringEnvVars(
      "AMAZON_PAYER_SECRET_PATH",
      `${this.CHAIN.toUpperCase()}_AMAZON_PAYER_SECRET_PATH`
    );
    this.AZURE_PAYER_SECRET_PATH = extractStringEnvVars(
      "AZURE_PAYER_SECRET_PATH",
      `${this.CHAIN.toUpperCase()}_AZURE_PAYER_SECRET_PATH`
    );
  }

  static getHealthCheckPort(): number {
    return Number.parseInt(process.env.HEALTH_CHECK_PORT ?? "8080");
  }

  static getPagerDutyKey(): string | undefined {
    return process.env.PAGERDUTY_EVENT_KEY;
  }

  static getMetricsExporter(): "opentelemetry-collector" | "prometheus" {
    return process.env.METRICS_EXPORTER === "opentelemetry-collector"
      ? "opentelemetry-collector"
      : "prometheus";
  }

  static getMetricsExporterPort(): number {
    return process.env.METRICS_EXPORTER_PORT
      ? Number.parseInt(process.env.METRICS_EXPORTER_PORT)
      : 9090;
  }

  static VERBOSE() {
    return BaseEnvironment.parseBoolean("VERBOSE");
  }

  static DEBUG() {
    return BaseEnvironment.parseBoolean("DEBUG");
  }

  static getTaskRunnerConfig(): {
    GCP_CONFIG_BUCKET?: string;
    AWS_CONFIG_BUCKET?: string;
    TASK_RUNNER_SOLANA_RPC?: string;
    JUPITER_SWAP_API_KEY?: string;
  } {
    return {
      GCP_CONFIG_BUCKET: extractStringEnvVar("GCP_CONFIG_BUCKET"),
      AWS_CONFIG_BUCKET: extractStringEnvVar("AWS_CONFIG_BUCKET"),
      TASK_RUNNER_SOLANA_RPC: BaseEnvironment.getTaskRunnerUrl(),
      JUPITER_SWAP_API_KEY: extractStringEnvVar("JUPITER_SWAP_API_KEY"),
    };
  }

  static getChain(): ChainType {
    const chain = extractNonNullableStringEnvVar("CHAIN");
    if (!isSupportedChain(chain)) {
      throw new Error(
        `The provided chain '${chain}' is not yet supported by the Switchboard network. Available chains are: [${SWITCHBOARD_CHAINS.map(
          (c) => "'" + c + "'"
        ).join(", ")}]`
      );
    }
    return chain;
  }

  public static log() {
    NodeLogger.getInstance().debug(`Verbose logging enabled`, "Environment");
    NodeLogger.getInstance().env("@switchboard-xyz/common", CommonPkg.version);
    NodeLogger.getInstance().env("TASK_RUNNER_VERSION", TaskRunnerPkg.version);
    NodeLogger.getInstance().env("ORACLE_VERSION", VERSION);
    try {
      NodeLogger.getInstance().env(
        "TASK_RUNNER_SOLANA_URL",
        process.env.TASK_RUNNER_SOLANA_RPC ??
          process.env.SOLANA_BACKUP_MAINNET_RPC ??
          process.env.BACKUP_MAINNET_RPC ??
          undefined ??
          "N/A"
      );
    } catch (error) {
      NodeLogger.getInstance().env("TASK_RUNNER_SOLANA_URL", "N/A");
    }
  }

  private static getTaskRunnerUrl(): string | undefined {
    return (
      process.env.TASK_RUNNER_SOLANA_RPC ??
      process.env.SOLANA_BACKUP_MAINNET_RPC ??
      process.env.BACKUP_MAINNET_RPC ??
      undefined
    );
  }

  get mainnetSolanaConnection(): Connection {
    if (this._mainnetSolanaConnection) {
      return this._mainnetSolanaConnection;
    }

    const taskRunnerSolanaEndpoint = this.TASK_RUNNER_SOLANA_RPC;
    if (taskRunnerSolanaEndpoint) {
      this._mainnetSolanaConnection = new Connection(taskRunnerSolanaEndpoint, {
        commitment: DEFAULT_COMMITMENT,
      });
      return this._mainnetSolanaConnection;
    }

    throw new Error(
      `Need to provide $TASK_RUNNER_SOLANA_RPC in order to use the Switchboard task runner.`
    );
  }

  public async loadSecret<T>(
    parseSecretString: (secretString: string) => T
  ): Promise<T> {
    if (this.PAYER_SECRET) {
      try {
        try {
          const key = new Uint8Array(JSON.parse(this.PAYER_SECRET));
          return Keypair.fromSecretKey(key) as any;
        } catch (error) {
          const key = bs58.decode(this.PAYER_SECRET);
          return Keypair.fromSecretKey(key) as any;
        }
      } catch (error: any) {
        NodeLogger.getInstance().debug(
          `Environment variable secret derivation failure: ${error}`,
          "Environment"
        );
      }
    }
    if (this.GOOGLE_PAYER_SECRET_PATH) {
      try {
        return await GcpProvider.getSecret(
          this.GOOGLE_PAYER_SECRET_PATH,
          parseSecretString
        );
      } catch (error: any) {
        console.error(error);
        NodeLogger.getInstance().debug(
          `GCP Secret derivation failure: ${error}`,
          "Environment"
        );
      }
    }

    if (this.AMAZON_PAYER_SECRET_PATH) {
      try {
        return await AwsProvider.getSecret(
          this.AMAZON_PAYER_SECRET_PATH,
          parseSecretString
        );
      } catch (error: any) {
        NodeLogger.getInstance().debug(
          `Amazon Secret derivation failure: ${error}`,
          "Environment"
        );
      }
    }
    if (this.AZURE_PAYER_SECRET_PATH) {
      // Try azure secret keypair
      try {
        return await AzureProvider.getSecret(
          this.AZURE_PAYER_SECRET_PATH,
          parseSecretString
        );
      } catch (error: any) {
        NodeLogger.getInstance().debug(
          `Azure Secret derivation failure: ${error}`,
          "Environment"
        );
        // we should throw here
      }
    }

    if (fs.existsSync(this.FS_PAYER_SECRET_PATH)) {
      try {
        return FsProvider.getSecret(
          this.FS_PAYER_SECRET_PATH,
          parseSecretString
        );
      } catch (error: any) {
        NodeLogger.getInstance().debug(
          `Fs payer secret derivation failure: ${this.FS_PAYER_SECRET_PATH} - ${error}`,
          "Environment"
        );
      }
    }

    try {
      return DockerProvider.getSecret(
        this.DOCKER_PAYER_SECRET ?? "PAYER_SECRETS",
        parseSecretString
      );
    } catch (error: any) {
      NodeLogger.getInstance().debug(
        `Docker Secret derivation failure: ${error}`,
        "Environment"
      );
    }

    NodeLogger.getInstance().env(
      "GOOGLE_PAYER_SECRET_PATH",
      this.GOOGLE_PAYER_SECRET_PATH
    );
    NodeLogger.getInstance().env(
      "AMAZON_PAYER_SECRET_PATH",
      this.AMAZON_PAYER_SECRET_PATH
    );
    NodeLogger.getInstance().env(
      "DOCKER_PAYER_SECRET",
      this.DOCKER_PAYER_SECRET ?? "PAYER_SECRETS"
    );
    NodeLogger.getInstance().env(
      "FS_PAYER_SECRET_PATH",
      this.FS_PAYER_SECRET_PATH
    );
    throw new Error("UnknownSecretDerivationMethodError");
  }
}
