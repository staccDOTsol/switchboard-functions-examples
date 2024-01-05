import { DEFAULT_COMMITMENT } from "../chains/solana/types";
import { Sgx } from "../modules/sgx";

import { BaseEnvironment } from "./BaseEnvironment";

import type { Cluster } from "@solana/web3.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  extractBooleanEnvVar,
  extractIntegerEnvVar,
  extractStringEnvVars,
} from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import {
  DEVNET_GENESIS_HASH,
  MAINNET_GENESIS_HASH,
} from "@switchboard-xyz/solana.js";
import * as fs from "fs";

export class SolanaEnvironment extends BaseEnvironment {
  private static instance: SolanaEnvironment;

  public NETWORK_ID: Cluster | "localnet" = "mainnet-beta";
  public SOLANA_ORACLE_KEY?: PublicKey;

  readonly SOLANA_RPC_URL: string;
  readonly SOLANA_WS_URL?: string;
  readonly BACKUP_MAINNET_RPC?: string;
  readonly SOLANA_CRANK_KEY?: PublicKey;
  readonly SOLANA_QUEUE_KEY?: PublicKey;
  readonly SOLANA_SAS_QUEUE_KEY?: PublicKey;
  readonly UNWRAP_STAKE_THRESHOLD?: number;

  readonly DISABLE_NONCE_QUEUE: boolean;
  readonly ENABLE_DATA_FEED_NONCE?: boolean;
  readonly NONCE_QUEUE_SIZE: number;

  readonly SOLANA_SAVE_RESULT_COMPUTE_UNITS: number;
  readonly SOLANA_CRANK_POP_COMPUTE_UNITS: number;
  readonly SOLANA_COMPUTE_UNIT_PRICE?: number;
  readonly ENABLE_NONCE_SAVE_RESULT: boolean;

  readonly SOLANA_DISABLE_REST_CONNECTION: boolean;

  readonly SOLANA_DISABLE_ECVRF_BINARY: boolean;
  readonly SOLANA_DISABLE_ECVRF_WASM: boolean;

  readonly SOLANA_BLOCKHASH_REFRESH_RATE: number;

  private _connection?: Connection;

  public static getInstance(): SolanaEnvironment {
    if (!SolanaEnvironment.instance) {
      SolanaEnvironment.instance = new SolanaEnvironment();
    }

    return SolanaEnvironment.instance;
  }

  private constructor() {
    super();
    try {
      this.NETWORK_ID = SolanaEnvironment.getCluster();
      this.SOLANA_RPC_URL = SolanaEnvironment.getRpcUrl();
      this.SOLANA_WS_URL = SolanaEnvironment.getWsUrl();
      this.SOLANA_ORACLE_KEY = SolanaEnvironment.getOracleKey();
      this.SOLANA_CRANK_KEY = SolanaEnvironment.getCrankKey();
      this.SOLANA_QUEUE_KEY = SolanaEnvironment.getQueueKey();
      this.SOLANA_SAS_QUEUE_KEY = SolanaEnvironment.getSasQueueKey();

      this.SOLANA_DISABLE_REST_CONNECTION = extractBooleanEnvVar(
        "SOLANA_DISABLE_REST_CONNECTION"
      );

      this.UNWRAP_STAKE_THRESHOLD =
        extractIntegerEnvVar("UNWRAP_STAKE_THRESHOLD") ??
        extractIntegerEnvVar("SOLANA_UNWRAP_STAKE_THRESHOLD") ??
        0;

      this.ENABLE_DATA_FEED_NONCE =
        extractBooleanEnvVar("SOLANA_ENABLE_DATA_FEED_NONCE") ??
        extractBooleanEnvVar("ENABLE_DATA_FEED_NONCE") ??
        false;

      this.DISABLE_NONCE_QUEUE =
        this.NETWORK_ID === "mainnet-beta"
          ? false
          : extractBooleanEnvVar("DISABLE_NONCE_QUEUE");

      const nonceQueueSize =
        extractIntegerEnvVar("NONCE_QUEUE_SIZE") ??
        extractIntegerEnvVar("SOLANA_NONCE_QUEUE_SIZE") ??
        1000;

      this.NONCE_QUEUE_SIZE =
        this.NETWORK_ID === "mainnet-beta"
          ? Math.max(1000, nonceQueueSize)
          : this.DISABLE_NONCE_QUEUE
          ? 0
          : nonceQueueSize;

      this.SOLANA_DISABLE_ECVRF_BINARY = extractBooleanEnvVar(
        "SOLANA_DISABLE_ECVRF_BINARY"
      );
      this.SOLANA_DISABLE_ECVRF_WASM = extractBooleanEnvVar(
        "SOLANA_DISABLE_ECVRF_WASM"
      );

      this.SOLANA_SAVE_RESULT_COMPUTE_UNITS = Math.max(
        250000,
        extractIntegerEnvVar("SOLANA_SAVE_RESULT_COMPUTE_UNITS", 250000) ??
          250000
      );
      this.SOLANA_CRANK_POP_COMPUTE_UNITS = Math.max(
        125000,
        extractIntegerEnvVar("SOLANA_CRANK_POP_COMPUTE_UNITS", 200000) ?? 200000
      );
      this.SOLANA_COMPUTE_UNIT_PRICE = extractIntegerEnvVar(
        "SOLANA_COMPUTE_UNIT_PRICE"
      );
      this.ENABLE_NONCE_SAVE_RESULT =
        extractBooleanEnvVar("ENABLE_NONCE_SAVE_RESULT") ?? false;
      this.SOLANA_BLOCKHASH_REFRESH_RATE = Math.max(
        100,
        extractIntegerEnvVar("SOLANA_BLOCKHASH_REFRESH_RATE", 1000) ?? 1000
      );

      // attempt to set cluster based on genesis hash
      this.setCluster().catch();
    } catch (error) {
      BaseEnvironment.log();
      NodeLogger.getInstance().env("CLUSTER", this.NETWORK_ID);
      NodeLogger.getInstance().env("RPC_URL", SolanaEnvironment.getRpcUrl());
      NodeLogger.getInstance().env("WS_URL", SolanaEnvironment.getWsUrl());
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        process.env.SOLANA_ORACLE_KEY ?? process.env.ORACLE_KEY
      );
      NodeLogger.getInstance().env(
        "ENABLE_DATA_FEED_NONCE",
        process.env.SOLANA_ENABLE_DATA_FEED_NONCE ??
          process.env.ENABLE_DATA_FEED_NONCE
      );
      NodeLogger.getInstance().env(
        "ENABLE_NONCE_SAVE_RESULT",
        process.env.ENABLE_NONCE_SAVE_RESULT
      );
      NodeLogger.getInstance().env(
        "UNWRAP_STAKE_THRESHOLD",
        process.env.SOLANA_UNWRAP_STAKE_THRESHOLD ??
          process.env.UNWRAP_STAKE_THRESHOLD
      );

      throw error;
    }
  }

  get connection(): Connection {
    if (this._connection) {
      return this._connection;
    }

    return new Connection(this.SOLANA_RPC_URL, {
      commitment: DEFAULT_COMMITMENT,
      wsEndpoint: this.SOLANA_WS_URL ?? undefined,
    });
  }

  public static getOracleKey(): PublicKey | undefined {
    const pubkeyString = extractStringEnvVars(
      "ORACLE_KEY",
      "SOLANA_ORACLE_KEY"
    );
    return pubkeyString ? new PublicKey(pubkeyString) : undefined;
  }

  get oracleAddress(): PublicKey {
    if (this.SOLANA_ORACLE_KEY) {
      return this.SOLANA_ORACLE_KEY;
    }

    throw new Error(
      `Need to provide $SOLANA_ORACLE_KEY or $ORACLE_KEY in order to use the Switchboard oracle`
    );
  }

  private static getCrankKey(): PublicKey | undefined {
    const pubkeyString = extractStringEnvVars("CRANK_KEY", "SOLANA_CRANK_KEY");
    return pubkeyString ? new PublicKey(pubkeyString) : undefined;
  }

  public static getQueueKey(): PublicKey | undefined {
    const pubkeyString = extractStringEnvVars(
      "ORACLE_QUEUE_KEY",
      "SOLANA_ORACLE_QUEUE_KEY"
    );
    return pubkeyString ? new PublicKey(pubkeyString) : undefined;
  }

  public static getSasQueueKey(): PublicKey | undefined {
    const pubkeyString = extractStringEnvVars("SAS_QUEUE", "SOLANA_SAS_QUEUE");
    return pubkeyString ? new PublicKey(pubkeyString) : undefined;
  }

  get crankAddress(): PublicKey {
    if (this.SOLANA_CRANK_KEY) {
      return this.SOLANA_CRANK_KEY;
    }

    throw new Error(
      `Need to provide $SOLANA_CRANK_KEY or $CRANK_KEY in order to use the Switchboard crank`
    );
  }

  get mainnetSolanaConnection(): Connection {
    if (this._mainnetSolanaConnection) {
      return this._mainnetSolanaConnection;
    }

    if (this.NETWORK_ID === "mainnet-beta") {
      this._mainnetSolanaConnection = this.connection;
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

  public log() {
    BaseEnvironment.log();
    NodeLogger.getInstance().env("CLUSTER", this.NETWORK_ID);
    NodeLogger.getInstance().env("RPC_URL", this.SOLANA_RPC_URL);
    NodeLogger.getInstance().env("WS_URL", this.SOLANA_WS_URL);
    if (this.SOLANA_WS_URL) {
      NodeLogger.getInstance().env("WS_URL", this.SOLANA_WS_URL);
    }

    if (this.SOLANA_ORACLE_KEY) {
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        this.SOLANA_ORACLE_KEY ? this.SOLANA_ORACLE_KEY.toBase58() : ""
      );
    }
    if (this.SOLANA_CRANK_KEY) {
      NodeLogger.getInstance().env(
        "CRANK_KEY",
        this.SOLANA_CRANK_KEY ? this.SOLANA_CRANK_KEY.toBase58() : ""
      );
    }
  }

  private async inferCluster(): Promise<Cluster | "localnet"> {
    const genesisHash = await this.connection.getGenesisHash();
    switch (genesisHash) {
      case MAINNET_GENESIS_HASH:
        return "mainnet-beta";
      case DEVNET_GENESIS_HASH:
        return "devnet";
      default:
        return "localnet";
    }
  }

  public async setCluster() {
    const cluster = await this.inferCluster();
    this.NETWORK_ID = cluster;
    if (this.NETWORK_ID === "localnet") {
      this.LOCALNET = true;
    }
  }

  public static getCluster(): Cluster | "localnet" {
    const networkId = extractStringEnvVars(
      "NETWORK_ID",
      "SOLANA_NETWORK_ID",
      "CLUSTER",
      "SOLANA_CLUSTER"
    );
    switch (networkId) {
      case "devnet":
      case "testnet":
      case "localnet":
      case "mainnet-beta": {
        return networkId;
      }
      case "mainnet": {
        return "mainnet-beta";
      }
      default: {
        NodeLogger.getInstance().debug(
          `$CLUSTER or $SOLANA_CLUSTER not defined, defaulting to mainnet-beta`,
          "Environment"
        );
        return "mainnet-beta";
        // throw new Error(`SOLANA_CLUSTER or CLUSTER is not defined`);
      }
    }
  }

  public static getRpcUrl() {
    const cluster = SolanaEnvironment.getCluster();
    const rpcUrl = extractStringEnvVars("RPC_URL", "SOLANA_RPC_URL");
    if (cluster === "localnet") {
      return rpcUrl ?? "http://host.docker.internal:8899";
    }
    if (rpcUrl) {
      return rpcUrl;
    }

    // We should throw an error here, RPC_URL should always be defined
    throw new Error(`Need to provide $RPC_URL`);
  }

  public static getWsUrl(): string | undefined {
    const wsUrl = extractStringEnvVars("WS_URL", "SOLANA_WS_URL");
    if (wsUrl && wsUrl.startsWith("http")) {
      return "ws" + wsUrl.slice(4);
    }
    return wsUrl;
  }

  static parseKeypairString = (fileString: string): Keypair => {
    // check if bytes
    const parsedFileString = fileString
      .trim()
      .replace(/\n/g, "")
      .replace(/\s/g, "");
    const bytesRegex = /^\[(\s)?[0-9]+((\s)?,(\s)?[0-9]+){31,}\]/;
    if (bytesRegex.test(parsedFileString)) {
      return Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(parsedFileString))
      );
    }

    try {
      return Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(parsedFileString))
      );
    } catch {}

    throw new Error(`Failed to derive secret key from input file`);
  };

  async loadAuthority(): Promise<Keypair> {
    let secret: Keypair;
    if (Sgx.isInEnclave()) {
      // TODO: if made configurable make sure the user doesnt do any `..` to break
      // out of protected directory
      const keyPath = "/data/protected_files/keypair.bin";
      try {
        fs.accessSync(keyPath);
        const secretKey = fs.readFileSync(keyPath);
        return Keypair.fromSecretKey(secretKey);
      } catch {}
      const randBuf = Sgx.readSgxRandomness(32);
      secret = Keypair.fromSeed(randBuf);
      fs.writeFileSync(keyPath, Buffer.from(secret.secretKey));
    } else {
      secret = await this.loadSecret(SolanaEnvironment.parseKeypairString);
    }
    return secret;
  }

  async loadKeypair(): Promise<Keypair> {
    return await this.loadSecret(SolanaEnvironment.parseKeypairString);
  }

  toJSON() {
    return {
      CLUSTER: this.NETWORK_ID,
      RPC_URL: this.SOLANA_RPC_URL,
      WS_URL: this.SOLANA_WS_URL,
      BACKUP_MAINNET_RPC: this.BACKUP_MAINNET_RPC,
      ORACLE_KEY: this.SOLANA_ORACLE_KEY?.toString(),
      UNWRAP_STAKE_THRESHOLD: this.UNWRAP_STAKE_THRESHOLD,
      ENABLE_DATA_FEED_NONCE: this.ENABLE_DATA_FEED_NONCE,
      NONCE_QUEUE_SIZE: this.NONCE_QUEUE_SIZE,
      ENABLE_NONCE_SAVE_RESULT: this.ENABLE_NONCE_SAVE_RESULT,
    };
  }

  toString() {
    return JSON.stringify(this.toJSON(), undefined, 2);
  }

  public static isSwitchboardMainnetQueue(queuePubkey: string): boolean {
    return (
      queuePubkey === "3HBb2DQqDfuMdzWxNk1Eo9RTMkFYmuEAd32RiLKn9pAn" ||
      queuePubkey === "5JYwqvKkqp35w8Nq3ba4z1WYUeJQ1rB36V8XvaGp6zn1"
    );
  }

  public static isSwitchboardDevnetQueue(queuePubkey: string): boolean {
    return (
      queuePubkey === "GhYg3R1V6DmJbwuc57qZeoYG6gUuvCotUF1zU3WCj98U" ||
      queuePubkey === "F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy" ||
      queuePubkey === "PeRMnAqNqHQYHUuCBEjhm1XPeVTh4BxjY4t4TPan1pG" ||
      queuePubkey === "uPeRMdfPmrPqgRWSrjAnAkH78RqAhe5kXoW6vBYRqFX"
    );
  }

  public isSwitchboardQueue(queuePubkey: string): boolean {
    if (this.NETWORK_ID === "mainnet-beta") {
      return SolanaEnvironment.isSwitchboardMainnetQueue(queuePubkey);
    } else if (this.NETWORK_ID === "devnet") {
      return SolanaEnvironment.isSwitchboardDevnetQueue(queuePubkey);
    }
    return false;
  }
}
