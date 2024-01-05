import { BaseEnvironment } from "./BaseEnvironment";

import { parseAddressString } from "@switchboard-xyz/near.js";
import {
  extractNonNullableStringEnvVars,
  extractStringEnvVars,
} from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import { KeyPair } from "near-api-js";

const isBase58 = (value: string): boolean =>
  /^[A-HJ-NP-Za-km-z1-9]*$/.test(value);

type NearNetwork = "testnet" | "mainnet" | "betanet" | "localnet";

export class NearEnvironment extends BaseEnvironment {
  private static instance: NearEnvironment;

  public NETWORK_ID: NearNetwork = "mainnet";

  readonly NEAR_RPC_URL: string;
  readonly NEAR_ORACLE_KEY?: string;
  readonly NEAR_CRANK_KEY?: string;
  readonly NEAR_NAMED_ACCOUNT: string;
  readonly MAINNET_NEAR_LAKE_LISTENER: boolean;

  public static getInstance(): NearEnvironment {
    if (!NearEnvironment.instance) {
      NearEnvironment.instance = new NearEnvironment();
    }

    return NearEnvironment.instance;
  }

  private constructor() {
    super();
    try {
      this.NETWORK_ID = NearEnvironment.getNetworkId();
      if (this.NETWORK_ID === "localnet") {
        this.LOCALNET = true;
      }
      this.NEAR_RPC_URL = NearEnvironment.getRpcUrl();
      this.NEAR_ORACLE_KEY = NearEnvironment.getOracleKey();
      this.NEAR_CRANK_KEY = NearEnvironment.getCrankKey();
      this.NEAR_NAMED_ACCOUNT = NearEnvironment.getNamedAccount();
      this.MAINNET_NEAR_LAKE_LISTENER = Boolean(
        process.env.NEAR_LAKE_LISTENER &&
          (Number.parseInt(process.env.NEAR_LAKE_LISTENER) > 0 ||
            process.env.NEAR_LAKE_LISTENER === "true")
          ? true
          : false
      );
    } catch (error) {
      BaseEnvironment.log();
      NodeLogger.getInstance().env(
        "NEAR_NETWORK_ID",
        process.env.NEAR_NETWORK_ID ?? "testnet"
      );
      NodeLogger.getInstance().env(
        "NEAR_NAMED_ACCOUNT",
        process.env.NEAR_NAMED_ACCOUNT
      );
      NodeLogger.getInstance().env("NEAR_RPC_URL", process.env.NEAR_RPC_URL);
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        process.env.NEAR_ORACLE_KEY ?? process.env.ORACLE_KEY
      );
      NodeLogger.getInstance().env(
        "CRANK_KEY",
        process.env.NEAR_CRANK_KEY ?? process.env.CRANK_KEY
      );

      throw error;
    }
  }

  private static getRpcUrl(): string {
    return extractNonNullableStringEnvVars("RPC_URL", "NEAR_RPC_URL");
  }

  private static getOracleKey(): string | undefined {
    return extractStringEnvVars("ORACLE_KEY", "NEAR_ORACLE_KEY");
  }

  get oracleAddress(): Uint8Array {
    if (this.NEAR_ORACLE_KEY) {
      return parseAddressString(this.NEAR_ORACLE_KEY);
    }

    throw new Error(
      `Need to provide $NEAR_ORACLE_KEY or $ORACLE_KEY in order to use the Switchboard oracle`
    );
  }

  private static getCrankKey(): string | undefined {
    return extractStringEnvVars("CRANK_KEY", "NEAR_CRANK_KEY");
  }

  get crankAddress(): Uint8Array {
    if (this.NEAR_CRANK_KEY) {
      return parseAddressString(this.NEAR_CRANK_KEY);
    }

    throw new Error(
      `Need to provide $NEAR_CRANK_KEY or $CRANK_KEY in order to use the Switchboard crank`
    );
  }

  private static getNamedAccount(): string {
    return extractNonNullableStringEnvVars(
      "NEAR_NAMED_ACCOUNT",
      "NEAR_ACCOUNT_ID"
    );
  }

  private static getNetworkId(): NearNetwork {
    const networkId = extractStringEnvVars("NETWORK_ID", "NEAR_NETWORK_ID");
    switch (networkId) {
      case "testnet":
      case "mainnet":
      case "betanet":
      case "localnet": {
        return networkId;
      }
      default:
        throw new Error(
          `$NEAR_NETWORK_ID must be 'testnet', 'mainnet', 'betanet', or 'localnet'`
        );
    }
  }

  static parseKeypairString = (fileString: string): KeyPair => {
    // try parsing as a raw string
    try {
      const trimmedFileString = fileString.trim();
      if (!isBase58(trimmedFileString)) {
        throw new Error(`Not a base58 string`);
      }
      const keypair = KeyPair.fromString(trimmedFileString);
      return keypair;
    } catch (error) {}

    // try parsing as a JSON file
    try {
      const keypairFile: {
        account_id: string;
        public_key: string;
        private_key: string;
      } = JSON.parse(fileString);
      const [algo, secretKey] = keypairFile.private_key.split(":");
      const keypair = KeyPair.fromString(secretKey);
      return keypair;
    } catch (error) {}

    throw new Error(`Failed to derive secret key from input file`);
  };

  async loadKeypair(): Promise<KeyPair> {
    const secret = await this.loadSecret(NearEnvironment.parseKeypairString);
    return secret;
  }

  log() {
    BaseEnvironment.log();
    NodeLogger.getInstance().env("NEAR_NETWORK_ID", this.NETWORK_ID);
    NodeLogger.getInstance().env("NEAR_NAMED_ACCOUNT", this.NEAR_NAMED_ACCOUNT);
    NodeLogger.getInstance().env("NEAR_RPC_URL", this.NEAR_RPC_URL);

    if (this.NEAR_ORACLE_KEY) {
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        this.NEAR_ORACLE_KEY ? this.NEAR_ORACLE_KEY : ""
      );
    }
    if (this.NEAR_CRANK_KEY) {
      NodeLogger.getInstance().env(
        "CRANK_KEY",
        this.NEAR_CRANK_KEY ? this.NEAR_CRANK_KEY : ""
      );
    }
  }
}
