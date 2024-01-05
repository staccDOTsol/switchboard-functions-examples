import { Option } from "commander";

export interface CliOptions {
  cluster: "devnet" | "mainnet-beta";
  mainnetUrl: string;
  rpcUrl: string;
  chain: "solana" | "aptos" | "near";
}

export const CLUSTER_OPTION: Option = new Option(
  "--cluster <cluster>",
  "Optional cluster to fetch public key account"
)
  .choices(["devnet", "mainnet-beta"])
  .default("mainnet-beta", "mainnet-beta");

export const MAINNET_URL_OPTION: Option = new Option(
  "--mainnetUrl <string>",
  "Required Mainnet RPC URL to connect to"
)
  .env("SOLANA_MAINNET_RPC")
  .default("https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a");

export const RPC_URL_OPTION: Option = new Option(
  "--rpcUrl [string]",
  "Optional RPC URL to connect to"
)
  .env("SOLANA_RPC_URL")
  .default("https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a");

export const CHAIN_OPTION: Option = new Option(
  "--chain <chain>",
  "Optional chain to fetch job or aggregator definitions from"
)
  .choices(["solana", "aptos", "near"])
  .default("solana");
