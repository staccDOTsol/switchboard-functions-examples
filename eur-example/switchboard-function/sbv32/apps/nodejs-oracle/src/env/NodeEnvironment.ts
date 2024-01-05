import type { ChainEnvironment } from "../types/ChainEnvironment";

import { AptosEnvironment } from "./AptosEnvironment";
import { EVMEnvironment } from "./EVMEnvironment";
import { NearEnvironment } from "./NearEnvironment";
import { SolanaEnvironment } from "./SolanaEnvironment";
import { SuiEnvironment } from "./SuiEnvironment";

import type { ChainType } from "@switchboard-xyz/common";
import { isSupportedChain, SWITCHBOARD_CHAINS } from "@switchboard-xyz/common";
import { extractNonNullableStringEnvVar } from "@switchboard-xyz/node";
import * as dotenv from "dotenv";

dotenv.config();

export class NodeEnvironment {
  private static instance: NodeEnvironment;

  public static getInstance(): ChainEnvironment<ChainType> {
    if (!NodeEnvironment.instance?.env) {
      const env = NodeEnvironment.getEnv();
      NodeEnvironment.instance = new NodeEnvironment(env);
    }

    return NodeEnvironment.instance.env;
  }

  private constructor(readonly env: ChainEnvironment<ChainType>) {}

  private static getEnv(): ChainEnvironment<ChainType> {
    const chain = extractNonNullableStringEnvVar("CHAIN");
    if (!isSupportedChain(chain)) {
      throw new Error(
        `The provided chain '${chain}' is not yet supported by the Switchboard network. Available chains are: [${SWITCHBOARD_CHAINS.map(
          (c) => "'" + c + "'"
        ).join(", ")}]`
      );
    }
    return NodeEnvironment.fromChain(chain);
  }

  private static fromChain(chain: ChainType): ChainEnvironment<ChainType> {
    switch (chain) {
      case "aptos":
        return AptosEnvironment.getInstance();
      case "near":
        return NearEnvironment.getInstance();
      case "solana":
        return SolanaEnvironment.getInstance();
      case "arbitrum":
        return EVMEnvironment.getInstance();
      case "coredao":
        return EVMEnvironment.getInstance();
      case "sui":
        return SuiEnvironment.getInstance();
      default:
        throw new Error(`Failed to find environment for $CHAIN ${chain}`);
    }
  }

  public static isLocalnet(): boolean {
    const env = NodeEnvironment.getEnv();
    return env.LOCALNET || env.NETWORK_ID === "localnet";
  }
}
