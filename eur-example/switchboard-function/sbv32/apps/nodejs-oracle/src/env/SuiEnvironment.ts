import { BaseEnvironment } from "./BaseEnvironment";

import {
  Connection,
  Ed25519Keypair,
  fromB64,
  JsonRpcProvider,
} from "@mysten/sui.js";
import {
  extractNonNullableStringEnvVars,
  extractStringEnvVars,
} from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";

export type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

export class SuiEnvironment extends BaseEnvironment {
  private static instance: SuiEnvironment;

  public NETWORK_ID: SuiNetwork = "mainnet";

  readonly SUI_RPC_URL: string;
  readonly SUI_PID: string;
  readonly SUI_ORACLE_KEY?: string;
  readonly SUI_CRANK_KEY?: string;

  public static getInstance(): SuiEnvironment {
    if (!SuiEnvironment.instance) {
      SuiEnvironment.instance = new SuiEnvironment();
    }

    return SuiEnvironment.instance;
  }

  private _client?: JsonRpcProvider;

  get client(): JsonRpcProvider {
    if (this._client) {
      return this._client;
    }

    return new JsonRpcProvider(
      new Connection({
        fullnode: this.SUI_RPC_URL,
      })
    );
  }

  private constructor() {
    super();
    try {
      this.SUI_RPC_URL = SuiEnvironment.getRpcUrl();
      if (
        this.SUI_RPC_URL.includes("localhost") ||
        this.SUI_RPC_URL.includes("127.0.0.1") ||
        this.SUI_RPC_URL.includes("0.0.0.0")
      ) {
        this.NETWORK_ID = "localnet";
        this.LOCALNET = true;
      }
      this.SUI_PID = SuiEnvironment.getProgramId();
      this.SUI_ORACLE_KEY = SuiEnvironment.getOracleKey();
      this.SUI_CRANK_KEY = SuiEnvironment.getCrankKey();
    } catch (error) {
      BaseEnvironment.log();
      NodeLogger.getInstance().env(
        "SUI_PID",
        extractStringEnvVars("PROGRAM_ID", "SUI_PROGRAM_ID")
      );
      NodeLogger.getInstance().env(
        "SUI_RPC_URL",
        extractStringEnvVars("RPC_URL", "SUI_RPC_URL")
      );
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        extractStringEnvVars("ORACLE_KEY", "SUI_ORACLE_KEY")
      );
      NodeLogger.getInstance().env(
        "CRANK_KEY",
        extractStringEnvVars("CRANK_KEY", "SUI_CRANK_KEY")
      );

      throw error;
    }
  }

  public async setNetwork() {
    if (
      this.SUI_RPC_URL.includes("localhost") ||
      this.SUI_RPC_URL.includes("127.0.0.1") ||
      this.SUI_RPC_URL.includes("0.0.0.0")
    ) {
      this.NETWORK_ID = "localnet";
      this.LOCALNET = true;
    } else if (this.SUI_RPC_URL.includes("devnet")) {
      this.NETWORK_ID = "devnet";
    } else if (this.SUI_RPC_URL.includes("testnet")) {
      this.NETWORK_ID = "testnet";
    } else {
      this.NETWORK_ID = "mainnet";
    }
  }

  private static getRpcUrl(): string {
    return extractNonNullableStringEnvVars("RPC_URL", "SUI_RPC_URL");
  }

  private static getOracleKey(): string | undefined {
    return extractStringEnvVars("ORACLE_KEY", "SUI_ORACLE_KEY");
  }

  get oracleAddress(): string {
    if (this.SUI_ORACLE_KEY) {
      return this.SUI_ORACLE_KEY;
    }

    throw new Error(
      `Need to provide $SUI_ORACLE_KEY or $ORACLE_KEY in order to use the Switchboard oracle`
    );
  }

  private static getCrankKey(): string | undefined {
    return extractStringEnvVars("CRANK_KEY", "SUI_CRANK_KEY");
  }

  get crankAddress(): string {
    if (this.SUI_CRANK_KEY) {
      return this.SUI_CRANK_KEY;
    }

    throw new Error(
      `Need to provide $SUI_CRANK_KEY or $CRANK_KEY in order to use the Switchboard crank`
    );
  }

  private static getProgramId(): string {
    const pid = extractNonNullableStringEnvVars("PROGRAM_ID", "SUI_PROGRAM_ID");
    return pid;
  }

  parseKeypairString = (fileString: string): Ed25519Keypair => {
    return SuiEnvironment.parseKeypairString(fileString);
  };

  static parseKeypairString = (fileString: string): Ed25519Keypair => {
    // check if bytes
    const parsedFileString = fileString
      .trim()
      .replace(/\n/g, "")
      .replace(/\s/g, "");

    // check if base64 encoded
    const base64Regex =
      /^(?:[A-Za-z\d+\/]{4})*(?:[A-Za-z\d+\/]{3}=|[A-Za-z\d+\/]{2}==)?/g;
    if (base64Regex.test(parsedFileString)) {
      // sui encodes keys with byte in the beggining to indicate the type of key
      const str = fromB64(parsedFileString).slice(1);
      return Ed25519Keypair.fromSecretKey(str);
    }

    const bytesRegex = /^\[(\s)?[0-9]+((\s)?,(\s)?[0-9]+){31,}\]/g;
    if (bytesRegex.test(parsedFileString)) {
      return Ed25519Keypair.fromSecretKey(Buffer.from(parsedFileString));
    }

    const hexRegex = /^(0x|0X)?[a-fA-F0-9]{64}/g;
    if (hexRegex.test(parsedFileString)) {
      return Ed25519Keypair.fromSecretKey(
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

    throw new Error(`Failed to derive secret key from input file`);
  };

  async loadAccount(): Promise<Ed25519Keypair> {
    const secret = await this.loadSecret(SuiEnvironment.parseKeypairString);
    return secret;
  }

  log() {
    BaseEnvironment.log();
    NodeLogger.getInstance().env("SUI_PID", this.SUI_PID.toString());
    NodeLogger.getInstance().env("SUI_RPC_URL", this.SUI_RPC_URL);
    NodeLogger.getInstance().env("ORACLE_KEY", this.SUI_ORACLE_KEY);

    if (this.SUI_ORACLE_KEY) {
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        this.SUI_ORACLE_KEY ? this.SUI_ORACLE_KEY : ""
      );
    }
  }
}
