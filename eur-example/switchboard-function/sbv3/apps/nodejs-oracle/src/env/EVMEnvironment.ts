import { BaseEnvironment } from "./BaseEnvironment";

import { JsonRpcProvider } from "@ethersproject/providers";
import {
  extractNonNullableStringEnvVars,
  extractStringEnvVars,
} from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";

export class EVMEnvironment extends BaseEnvironment {
  private static instance: EVMEnvironment;

  private _provider?: JsonRpcProvider;

  readonly EVM_RPC_URL: string;
  readonly EVM_CONTRACT_ADDRESS: string;
  readonly EVM_ORACLE_KEY?: string;
  readonly EVM_CHAIN_ID?: string;

  public static getInstance(): EVMEnvironment {
    if (!EVMEnvironment.instance) {
      EVMEnvironment.instance = new EVMEnvironment();
    }

    return EVMEnvironment.instance;
  }

  private constructor() {
    super();

    try {
      this.EVM_RPC_URL = EVMEnvironment.getRpcUrl();
      if (
        this.EVM_RPC_URL.includes("localhost") ||
        this.EVM_RPC_URL.includes("127.0.0.1") ||
        this.EVM_RPC_URL.includes("0.0.0.0")
      ) {
        this.NETWORK_ID = "localnet";
        this.LOCALNET = true;
      }

      this.EVM_CONTRACT_ADDRESS = EVMEnvironment.getProgramId();
      this.EVM_ORACLE_KEY = EVMEnvironment.getOracleKey();
      this.EVM_CHAIN_ID = EVMEnvironment.getEVMChainId();
    } catch (error) {
      NodeLogger.getInstance().env(
        "EVM_CONTRACT_ADDRESS",
        process.env.EVM_CONTRACT_ADDRESS
      );
      NodeLogger.getInstance().env("EVM_RPC_URL", process.env.EVM_RPC_URL);
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        process.env.EVM_ORACLE_KEY ?? process.env.ORACLE_KEY
      );

      throw error;
    }
  }

  get provider(): JsonRpcProvider {
    if (this._provider) {
      return this._provider;
    }
    return new JsonRpcProvider(this.EVM_RPC_URL);
  }

  public async setNetwork() {
    if (
      this.EVM_RPC_URL.includes("localhost") ||
      this.EVM_RPC_URL.includes("127.0.0.1") ||
      this.EVM_RPC_URL.includes("0.0.0.0")
    ) {
      this.NETWORK_ID = "localnet";
      this.LOCALNET = true;
    }

    const chainId = await this.provider.getNetwork().then((network) => {
      return network.chainId;
    });

    NodeLogger.getInstance().env("EVM_CHAIN_ID", this.EVM_CHAIN_ID!.toString());
    switch (chainId) {
      case 1116: {
        this.NETWORK_ID = "mainnet";
        return;
      }
      case 1115: {
        this.NETWORK_ID = "testnet";
        return;
      }
      default: {
        this.NETWORK_ID = "testnet";
        return;
      }
    }
  }

  private static getEVMChainId(): string {
    return extractNonNullableStringEnvVars("CHAIN_ID", "EVM_CHAIN_ID");
  }

  private static getRpcUrl(): string {
    return extractNonNullableStringEnvVars("RPC_URL", "EVM_RPC_URL");
  }

  private static getOracleKey(): string | undefined {
    return extractStringEnvVars("ORACLE_KEY", "EVM_ORACLE_KEY");
  }

  get oracleAddress(): string {
    if (this.EVM_ORACLE_KEY) {
      return this.EVM_ORACLE_KEY;
    }

    throw new Error(
      `Need to provide $EVM_ORACLE_KEY or $ORACLE_KEY in order to use the Switchboard oracle`
    );
  }

  private static getProgramId(): string {
    return extractNonNullableStringEnvVars(
      "PROGRAM_ID",
      "EVM_PROGRAM_ID",
      "EVM_CONTRACT_ADDRESS"
    );
  }

  static parseKeypairString = (fileString: string): string => {
    // check if bytes
    const parsedFileString = fileString
      .trim()
      .replace(/\n/g, "")
      .replace(/\s/g, "");
    const bytesRegex = /^\[(\s)?[0-9]+((\s)?,(\s)?[0-9]+){31,}\]/g;
    if (bytesRegex.test(parsedFileString)) {
      return parsedFileString;
    }

    // check if hex
    const hexRegex = /^(0x|0X)?[a-fA-F0-9]{64}/g;
    if (hexRegex.test(parsedFileString)) {
      return parsedFileString.toLowerCase().startsWith("0x")
        ? parsedFileString.slice(2)
        : parsedFileString;
    }

    // check if base64 encoded
    const base64Regex =
      /^(?:[A-Za-z\d+\/]{4})*(?:[A-Za-z\d+\/]{3}=|[A-Za-z\d+\/]{2}==)?/g;
    if (base64Regex.test(parsedFileString)) {
      return Buffer.from(parsedFileString, "base64").toString();
    }

    throw new Error(`Failed to derive secret key from input file`);
  };

  async loadAccount(): Promise<string> {
    const secret = await this.loadSecret(EVMEnvironment.parseKeypairString);
    return secret;
  }

  log() {
    NodeLogger.getInstance().env(
      "EVM_CONTRACT_ADDRESS",
      this.EVM_CONTRACT_ADDRESS
    );
    NodeLogger.getInstance().env("EVM_RPC_URL", this.EVM_RPC_URL);
    NodeLogger.getInstance().env("ORACLE_KEY", this.EVM_ORACLE_KEY);

    if (this.EVM_ORACLE_KEY) {
      NodeLogger.getInstance().env(
        "ORACLE_KEY",
        this.EVM_ORACLE_KEY ? this.EVM_ORACLE_KEY : ""
      );
    }
  }
}
