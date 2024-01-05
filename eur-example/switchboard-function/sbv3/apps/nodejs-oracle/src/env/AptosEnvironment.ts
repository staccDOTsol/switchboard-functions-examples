import { BaseEnvironment } from "./BaseEnvironment";

import {
  extractNonNullableStringEnvVars,
  extractStringEnvVars,
} from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import { AptosAccount, AptosClient, HexString } from "aptos";

export type AptosNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

export class AptosEnvironment extends BaseEnvironment {
  private static instance: AptosEnvironment;

  public NETWORK_ID: AptosNetwork = "mainnet";

  readonly APTOS_RPC_URL: string;
  readonly APTOS_PID: HexString;
  readonly APTOS_ORACLE_KEY?: string;
  readonly APTOS_CRANK_KEY?: string;

  public static getInstance(): AptosEnvironment {
    if (!AptosEnvironment.instance) {
      AptosEnvironment.instance = new AptosEnvironment();
    }

    return AptosEnvironment.instance;
  }

  private _client?: AptosClient;

  get client(): AptosClient {
    if (this._client) {
      return this._client;
    }

    return new AptosClient(this.APTOS_RPC_URL);
  }

  private constructor() {
    super();
    try {
      this.APTOS_RPC_URL = AptosEnvironment.getRpcUrl();
      if (
        this.APTOS_RPC_URL.includes("localhost") ||
        this.APTOS_RPC_URL.includes("127.0.0.1") ||
        this.APTOS_RPC_URL.includes("0.0.0.0")
      ) {
        this.NETWORK_ID = "localnet";
        this.LOCALNET = true;
      }
      this.APTOS_PID = AptosEnvironment.getProgramId();
      this.APTOS_ORACLE_KEY = AptosEnvironment.getOracleKey();
      this.APTOS_CRANK_KEY = AptosEnvironment.getCrankKey();
    } catch (error) {
      BaseEnvironment.log();
      NodeLogger.getInstance().env(
        "APTOS_PID",
        extractStringEnvVars("PROGRAM_ID", "APTOS_PROGRAM_ID")
      );
      NodeLogger.getInstance().env(
        "APTOS_RPC_URL",
        extractStringEnvVars("RPC_URL", "APTOS_RPC_URL")
      );
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        extractStringEnvVars("ORACLE_KEY", "APTOS_ORACLE_KEY")
      );
      NodeLogger.getInstance().env(
        "CRANK_KEY",
        extractStringEnvVars("CRANK_KEY", "APTOS_CRANK_KEY")
      );

      throw error;
    }
  }

  public async setNetwork() {
    if (
      this.APTOS_RPC_URL.includes("localhost") ||
      this.APTOS_RPC_URL.includes("127.0.0.1") ||
      this.APTOS_RPC_URL.includes("0.0.0.0")
    ) {
      this.NETWORK_ID = "localnet";
      this.LOCALNET = true;
    }

    const chainId = await this.client.getChainId();
    NodeLogger.getInstance().env("APTOS_CHAIN_ID", chainId.toString());
    switch (chainId) {
      case 1: {
        this.NETWORK_ID = "mainnet";
        return;
      }
      case 2: {
        this.NETWORK_ID = "testnet";
        return;
      }
      default: {
        this.NETWORK_ID = "devnet";
        return;
      }
    }
  }

  private static getRpcUrl(): string {
    return extractNonNullableStringEnvVars("RPC_URL", "APTOS_RPC_URL");
  }

  private static getOracleKey(): string | undefined {
    return extractStringEnvVars("ORACLE_KEY", "APTOS_ORACLE_KEY");
  }

  get oracleAddress(): HexString {
    if (this.APTOS_ORACLE_KEY) {
      return HexString.ensure(this.APTOS_ORACLE_KEY);
    }

    throw new Error(
      `Need to provide $APTOS_ORACLE_KEY or $ORACLE_KEY in order to use the Switchboard oracle`
    );
  }

  private static getCrankKey(): string | undefined {
    return extractStringEnvVars("CRANK_KEY", "APTOS_CRANK_KEY");
  }

  get crankAddress(): HexString {
    if (this.APTOS_CRANK_KEY) {
      return HexString.ensure(this.APTOS_CRANK_KEY);
    }

    throw new Error(
      `Need to provide $APTOS_CRANK_KEY or $CRANK_KEY in order to use the Switchboard crank`
    );
  }

  private static getProgramId(): HexString {
    const pid = extractNonNullableStringEnvVars(
      "PROGRAM_ID",
      "APTOS_PROGRAM_ID"
    );
    return HexString.ensure(pid);
  }

  parseKeypairString = (fileString: string): AptosAccount => {
    return AptosEnvironment.parseKeypairString(fileString);
  };

  static parseKeypairString = (fileString: string): AptosAccount => {
    // check if bytes
    const parsedFileString = fileString
      .trim()
      .replace(/\n/g, "")
      .replace(/\s/g, "");
    const bytesRegex = /^\[(\s)?[0-9]+((\s)?,(\s)?[0-9]+){31,}\]/g;
    if (bytesRegex.test(parsedFileString)) {
      return new AptosAccount(new Uint8Array(JSON.parse(parsedFileString)));
    }

    // check if hex
    const hexRegex = /^(0x|0X)?[a-fA-F0-9]{64}/g;
    if (hexRegex.test(parsedFileString)) {
      return new AptosAccount(
        new Uint8Array(
          Buffer.from(
            parsedFileString.toLowerCase().startsWith("0x")
              ? parsedFileString.slice(2)
              : parsedFileString,
            "hex"
          )
        )
      );
    }

    // check if base64 encoded
    const base64Regex =
      /^(?:[A-Za-z\d+\/]{4})*(?:[A-Za-z\d+\/]{3}=|[A-Za-z\d+\/]{2}==)?/g;
    if (base64Regex.test(parsedFileString)) {
      return new AptosAccount(
        new Uint8Array(Buffer.from(parsedFileString, "base64"))
      );
    }

    throw new Error(`Failed to derive secret key from input file`);
  };

  async loadAccount(): Promise<AptosAccount> {
    const secret = await this.loadSecret(AptosEnvironment.parseKeypairString);
    return secret;
  }

  log() {
    BaseEnvironment.log();
    NodeLogger.getInstance().env("APTOS_PID", this.APTOS_PID.toString());
    NodeLogger.getInstance().env("APTOS_RPC_URL", this.APTOS_RPC_URL);
    NodeLogger.getInstance().env("ORACLE_KEY", this.APTOS_ORACLE_KEY);

    if (this.APTOS_ORACLE_KEY) {
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        this.APTOS_ORACLE_KEY ? this.APTOS_ORACLE_KEY : ""
      );
    }
    if (this.APTOS_CRANK_KEY) {
      NodeLogger.getInstance().env(
        "CRANK_KEY",
        this.APTOS_CRANK_KEY ? this.APTOS_CRANK_KEY : ""
      );
    }
  }
}
