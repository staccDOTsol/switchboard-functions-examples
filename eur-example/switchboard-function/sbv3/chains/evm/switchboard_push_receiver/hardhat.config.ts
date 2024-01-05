import "hardhat-diamond-abi"; // needs to be loaded before typechain
import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-foundry";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-contract-sizer";
import "hardhat-abi-exporter";
import "@typechain/hardhat";

import type { JsonFragment } from "@ethersproject/abi";
import * as dotenv from "dotenv";
import * as ethers from "ethers";
import * as fs from "fs";
import type { HardhatUserConfig } from "hardhat/config";
import { task } from "hardhat/config";

const abiSet = new Set();

dotenv.config();

task("accounts", "Prints the list of accounts", async (_, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const config: HardhatUserConfig = {
  paths: {
    sources: "./src",
  },
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
    strict: true,
    only: [],
    except: [],
  },
  diamondAbi: {
    name: "SwitchboardPushReceiver",
    strict: false,
    exclude: [
      "IDiamondCut",
      "IDiamondLoupe",
      "IERC173",
      "IERC165",
      "LibDiamond",
    ],
    filter: (
      abiElement: unknown,
      index: number,
      abi: unknown[],
      fullyQualifiedName: string
    ) => {
      const signature = ethers.utils.Fragment.fromObject(
        abiElement as JsonFragment
      ).format();
      const includes = abiSet.has(signature);
      if (!includes) {
        abiSet.add(signature);
      }
      return !includes;
    },
  },
  abiExporter: {
    path: "./abis",
    runOnCompile: true,
    clear: true,
    flat: false,
    only: [],
    spacing: 2,
    pretty: true,
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      chainId: 31337,
      hardfork: "shanghai",
      allowUnlimitedContractSize: true,
      forking: {
        url: process.env.ETH_MAINNET_URL || "",
        // The Hardhat network will by default fork from the latest mainnet block
        // To pin the block number, specify it below
        // You will need access to a node with archival data for this to work!
        // blockNumber: 14743877,
        // If you want to do some forking, set `enabled` to true
        enabled: false,
      },
      // zksync: true, // Enables zkSync in the Hardhat local network
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      // gas: 30000000,
    },
    kovan: {
      chainId: 42,
      url: process.env.ETH_KOVAN_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    ropsten: {
      chainId: 3,
      url: process.env.ETH_ROPSTEN_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    goerli: {
      chainId: 5,
      url: process.env.ETH_GOERLI_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrumTestnet: {
      chainId: 421613,
      url:
        process.env.ARBITRUM_TESTNET_URL ||
        "https://goerli-rollup.arbitrum.io/rpc",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrumMainnet: {
      chainId: 42161,
      url: process.env.ARBITRUM_MAINNET_URL || "https://arb1.arbitrum.io/rpc",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    sepolia: {
      chainId: 11155111,
      url: process.env.ETH_SEPOLIA_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    ethMain: {
      chainId: 1,
      url: process.env.ETH_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    coredaoMain: {
      chainId: 1116,
      url:
        process.env.COREDAO_MAINNET_URL ||
        "https://api.infstones.com/core/mainnet/56852b950678445da33434fa3539b274",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    coredaoTestnet: {
      chainId: 1115,
      url: process.env.COREDAO_TESTNET_URL || "https://rpc.test.btcs.network",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    optimismTestnet: {
      chainId: 420,
      url: process.env.OPTIMISM_TESTNET_URL || "https://goerli.optimism.io",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    baseTestnet: {
      chainId: 84531,
      url:
        process.env.BASE_TESTNET_URL ||
        "https://base-goerli.g.alchemy.com/v2/ClyZ4o3fVUGNs9BapqOvCoPLMEoOLfaQ",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    optimismMain: {
      chainId: 10,
      url: process.env.OPTIMISM_MAINNET_URL || "https://mainnet.optimism.io",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    auroraTestnet: {
      chainId: 1313161555,
      url:
        process.env.AURORA_TESTNET_URL ||
        "https://aurora-testnet.infura.io/v3/04755baf707e4b8288caba12502ad047",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    auroraMainnet: {
      chainId: 1313161554,
      url:
        process.env.AURORA_MAINNET_URL ||
        "https://aurora-mainnet.infura.io/v3/04755baf707e4b8288caba12502ad047",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
