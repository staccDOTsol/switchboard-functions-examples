import type { IChainConfig, IStarknetNetworkConfig } from "./types.js";

export const SWITCHBOARD_STARKNET_MAINNET_CONFIG: IStarknetNetworkConfig = {
  chain: "starknet",
  chainId: "0x534e5f4d41494e",
  networkName: "Mainnet",
  address: "0x0728d32b3d508dbe5989824dd0edb1e03b8a319d561b9ec6507dff245a95c52f",
  sbPushOracle:
    "0x02b5ebc4a7149600ca4890102bdb6b7d6daac2fbb9d9ccd01f7198ca29107ec4",
  metadata: {
    defaultRpcUrl:
      "https://starknet-mainnet.infura.io/v3/01c29215e2f2486e8480edf1d74903bf",
    defaultExplorer: "https://starkscan.co/",
  },
  queues: [],
  attestationQueues: [
    {
      name: "SwitchboardLabs Attestation Queue",
      address:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    },
  ],
};

export const SWITCHBOARD_STARKNET_TESTNET_CONFIG: IStarknetNetworkConfig = {
  chain: "starknet",
  chainId: "0x534e5f474f45524c49",
  networkName: "Goerli",
  address: "0x026183fd8df673e4b2a007eec9d70bc38eb8a0df960dd5b0c57a9250ae2e63ac",
  sbPushOracle:
    "0x014d660768cb98256ceb18d821fd02fd1b54b6028679ceca3dbe03389228f285",
  metadata: {
    defaultRpcUrl:
      "https://nd-698-546-970.p2pify.com/f8299f4ae155a8f8cd51f16a35fc8f93",
    defaultExplorer: "https://testnet.starkscan.co/",
  },
  queues: [],
  attestationQueues: [
    {
      name: "SwitchboardLabs Attestation Queue",
      address:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    },
  ],
};

export const SWITCHBOARD_STARKNET_CONFIG: IChainConfig = {
  mainnet: SWITCHBOARD_STARKNET_MAINNET_CONFIG,
  testnet: SWITCHBOARD_STARKNET_TESTNET_CONFIG,
};
