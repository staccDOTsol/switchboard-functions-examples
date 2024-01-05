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
import * as path from "path";

const abiSet = new Set();

dotenv.config();

task("accounts", "Prints the list of accounts", async (_, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task(
  "balances",
  "Prints the list of accounts and their balances",
  async (_, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
      console.log(
        account.address +
          " " +
          (await hre.ethers.provider.getBalance(account.address))
      );
    }
  }
);

task("faucet", "Sends ETH and tokens to an address")
  .addPositionalParam("receiver", "The address that will receive them")
  .setAction(async ({ receiver }, hre) => {
    if (hre.network.name === "hardhat") {
      console.warn(
        "You are running the faucet task with Hardhat network, which" +
          "gets automatically created and destroyed every time. Use the Hardhat" +
          " option '--network localhost'"
      );
    }

    const addressesFile =
      __dirname + "/../frontend/src/contracts/contract-address.json";

    if (!fs.existsSync(addressesFile)) {
      console.error("You need to deploy your contract first");
      return;
    }

    const addressJson = fs.readFileSync(addressesFile, "utf-8");
    const address = JSON.parse(addressJson);

    if ((await hre.ethers.provider.getCode(address.Token)) === "0x") {
      console.error("You need to deploy your contract first");
      return;
    }

    const token = await hre.ethers.getContractAt("Token", address.Token);
    const [sender] = await hre.ethers.getSigners();

    const tx = await token.transfer(receiver, 100);
    await tx.wait();

    const tx2 = await sender.sendTransaction({
      to: receiver,
      value: hre.ethers.constants.WeiPerEther,
    });
    await tx2.wait();

    console.log(`Transferred 1 ETH and 100 tokens to ${receiver}`);
  });

task("genSelectors", "Generate a selector")
  .addPositionalParam("contractName", "")
  .setAction(async ({ contractName }, hre) => {
    const contractFilePath = path.join(
      __dirname,
      "out",
      `${contractName}.sol`,
      `${contractName}.json`
    );
    const contractArtifact = require(contractFilePath);
    const abi = contractArtifact.abi;
    const bytecode = contractArtifact.bytecode;
    const target = new ethers.ContractFactory(abi, bytecode);
    const signatures = Object.keys(target.interface.functions);

    const selectors: string[] = signatures.reduce((acc, val) => {
      if (val !== "init(bytes)") {
        acc.push(target.interface.getSighash(val));
      }
      return acc;
    }, [] as string[]);

    const coder = ethers.utils.defaultAbiCoder;
    const coded = coder.encode(["bytes4[]"], [selectors]);

    process.stdout.write(coded);
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
  diamondAbi: [
    {
      name: "Switchboard",
      strict: false,
      exclude: [
        "ISwitchboard",
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
  ],
  abiExporter: {
    path: "./abis",
    runOnCompile: true,
    clear: true,
    flat: false,
    only: [],
    spacing: 2,
    pretty: true,
  },
  gasReporter: {
    // enabled: process.env.REPORT_GAS !== undefined,
    enabled: true,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || "",
    outputFile: process.env.CI ? "GasReport.md" : undefined,
    noColors: process.env.CI ? true : undefined,
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
      url: "https://rpc-core.icecreamswap.com",
      // process.env.COREDAO_MAINNET_URL || "https://rpc-core.icecreamswap.com",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    coredaoTestnet: {
      chainId: 1115,
      url: process.env.COREDAO_TESTNET_URL || "https://rpc.test.btcs.network",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    bscTestnet: {
      chainId: 97,
      url: process.env.BSC_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    bscMain: {
      chainId: 56,
      url: process.env.BSC_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    optimismTestnet: {
      chainId: 420,
      url: process.env.OPTIMISM_TESTNET_URL || "https://goerli.optimism.io",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    optimismMain: {
      chainId: 10,
      url: process.env.OPTIMISM_MAINNET_URL || "https://mainnet.optimism.io",
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
    arbitrumMain: {
      chainId: 42161,
      url: process.env.ARBITRUM_MAINNET_URL || "https://arb1.arbitrum.io/rpc",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrumMainnet: {
      chainId: 42161,
      url: process.env.ARBITRUM_MAINNET_URL || "https://arb1.arbitrum.io/rpc",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrumNova: {
      chainId: 42170,
      url: process.env.ARBITRUM_NOVA_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    mumbai: {
      chainId: 80001,
      url: process.env.POLYGON_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    polygonZkEVMTestnet: {
      chainId: 1442,
      url: process.env.POLYGON_ZKEVM_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    polygon: {
      chainId: 137,
      url: process.env.POLYGON_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    polygonZkEVMMain: {
      chainId: 1101,
      url: process.env.POLYGON_ZKEVM_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    hecoTestnet: {
      chainId: 256,
      url: process.env.HECO_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    hecoMain: {
      chainId: 128,
      url: process.env.HECO_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    fantomTestnet: {
      chainId: 4002,
      url: process.env.FANTOM_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    fantomMain: {
      chainId: 250,
      url: process.env.FANTOM_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    fuji: {
      chainId: 43113,
      url: process.env.AVALANCHE_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    avalanche: {
      chainId: 43114,
      url: process.env.AVALANCHE_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    sokol: {
      chainId: 77,
      url: process.env.SOKOL_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    chiado: {
      chainId: 10200,
      url: process.env.GNOSIS_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    gnosis: {
      chainId: 100,
      url: process.env.GNOSIS_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    moonbaseAlpha: {
      chainId: 1287,
      url: process.env.MOONBEAM_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    moonriver: {
      chainId: 1285,
      url: process.env.MOONRIVER_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    moonbeam: {
      chainId: 1284,
      url: process.env.MOONBEAM_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    alfajores: {
      chainId: 44787,
      url: process.env.CELO_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    celo: {
      chainId: 42220,
      url: process.env.CELO_MAINNET_URL || "",
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
      url: process.env.AURORA_MAINNET_URL || "https://mainnet.aurora.dev",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    harmonyTestnet: {
      chainId: 1666700000,
      url: process.env.HARMONY_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    harmonyMain: {
      chainId: 1666600000,
      url: process.env.HARMONY_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    autobahnTestnet: {
      chainId: 45001,
      url: process.env.AUTOBAHN_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    autobahn: {
      chainId: 45000,
      url: process.env.AUTOBAHN_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    spark: {
      chainId: 123,
      url: process.env.FUSE_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    fuse: {
      chainId: 122,
      url: process.env.FUSE_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    cronosTestnet: {
      chainId: 338,
      url: process.env.CRONOS_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    cronosMain: {
      chainId: 25,
      url: process.env.CRONOS_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    evmosTestnet: {
      chainId: 9000,
      url: process.env.EVMOS_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    evmosMain: {
      chainId: 9001,
      url: process.env.EVMOS_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    bobaTestnet: {
      chainId: 2888,
      url: process.env.BOBA_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    bobaMain: {
      chainId: 288,
      url: process.env.BOBA_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    cantoTestnet: {
      chainId: 7701,
      url: process.env.CANTO_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    cantoMain: {
      chainId: 7700,
      url: process.env.CANTO_MAINNET_URL || "",
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
    mantleTestnet: {
      chainId: 5001,
      url: process.env.MANTLE_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    filecoinTestnet: {
      chainId: 3141,
      url: process.env.FILECOIN_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    scrollTestnet: {
      chainId: 534353,
      url: process.env.SCROLL_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    lineaTestnet: {
      chainId: 59140,
      url: process.env.LINEA_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    shimmerEVMTestnet: {
      chainId: 1071,
      url: process.env.SHIMMEREVM_TESTNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      // For Mainnet, Ropsten, Rinkeby, Goerli, Kovan, Sepolia
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      ropsten: process.env.ETHERSCAN_API_KEY || "",
      rinkeby: process.env.ETHERSCAN_API_KEY || "",
      goerli: process.env.ETHERSCAN_API_KEY || "",
      kovan: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      // For BSC testnet & mainnet
      bsc: process.env.BSC_API_KEY || "",
      bscTestnet: process.env.BSC_API_KEY || "",
      // For Heco testnet & mainnet
      heco: process.env.HECO_API_KEY || "",
      hecoTestnet: process.env.HECO_API_KEY || "",
      // For Fantom testnet & mainnet
      opera: process.env.FANTOM_API_KEY || "",
      ftmTestnet: process.env.FANTOM_API_KEY || "",
      // For Optimism testnet & mainnet
      optimisticEthereum: process.env.OPTIMISM_API_KEY || "",
      optimisticGoerli: process.env.OPTIMISM_API_KEY || "",
      // For Polygon testnets & mainnets
      polygon: process.env.POLYGON_API_KEY || "",
      polygonZkEVM: process.env.POLYGON_ZKEVM_API_KEY || "",
      polygonMumbai: process.env.POLYGON_API_KEY || "",
      polygonZkEVMTestnet: process.env.POLYGON_ZKEVM_API_KEY || "",
      // For Arbitrum testnet & mainnets
      arbitrumOne: process.env.ARBITRUM_API_KEY || "",
      arbitrumNova: process.env.ARBITRUM_NOVA_API_KEY || "",
      arbitrumTestnet: process.env.ARBITRUM_API_KEY || "",
      // For Avalanche testnet & mainnet
      avalanche: process.env.AVALANCHE_API_KEY || "",
      avalancheFujiTestnet: process.env.AVALANCHE_API_KEY || "",
      // For Moonbeam testnet & mainnets
      moonbeam: process.env.MOONBEAM_API_KEY || "",
      moonriver: process.env.MOONBEAM_API_KEY || "",
      moonbaseAlpha: process.env.MOONBEAM_API_KEY || "",
      // For Harmony testnet & mainnet
      harmony: process.env.HARMONY_API_KEY || "",
      harmonyTest: process.env.HARMONY_API_KEY || "",
      // For Autobahn testnet & mainnet
      autobahn: process.env.AUTOBAHN_API_KEY || "",
      autobahnTestnet: process.env.AUTOBAHN_API_KEY || "",
      // For Aurora testnet & mainnet
      aurora: process.env.AURORA_API_KEY || "",
      auroraTestnet: process.env.AURORA_API_KEY || "",
      // For Cronos testnet & mainnet
      cronos: process.env.CRONOS_API_KEY || "",
      cronosTestnet: process.env.CRONOS_API_KEY || "",
      // For Gnosis/xDai testnets & mainnets
      gnosis: process.env.GNOSIS_API_KEY || "",
      xdai: process.env.GNOSIS_API_KEY || "",
      sokol: process.env.GNOSIS_API_KEY || "",
      chiado: process.env.GNOSIS_API_KEY || "",
      // For Fuse testnet & mainnet
      fuse: process.env.FUSE_API_KEY || "",
      spark: process.env.FUSE_API_KEY || "",
      // For Evmos testnet & mainnet
      evmos: process.env.EVMOS_API_KEY || "",
      evmosTestnet: process.env.EVMOS_API_KEY || "",
      // For Boba network testnet & mainnet
      boba: process.env.BOBA_API_KEY || "",
      bobaTestnet: process.env.BOBA_API_KEY || "",
      // For Canto testnet & mainnet
      canto: process.env.CANTO_API_KEY || "",
      cantoTestnet: process.env.CANTO_API_KEY || "",
      // For Base testnet
      baseTestnet: process.env.BASE_API_KEY || "",
      // For Mantle testnet
      mantleTestnet: process.env.MANTLE_API_KEY || "",
      // For Scroll testnet
      scrollTestnet: process.env.SCROLL_API_KEY || "",
      // For Linea testnet
      lineaTestnet: process.env.LINEA_API_KEY || "",
      // For ShimmerEVM testnet
      shimmerEVMTestnet: process.env.SHIMMEREVM_API_KEY || "",
      // For CoreDAO
      coredao: process.env.COREDAO_API_KEY || "",
      coredaoTestnet: process.env.COREDAO_TESTNET_API_KEY || "",
    },
    customChains: [
      {
        network: "coredao",
        chainId: 1116,
        urls: {
          apiURL: "https://api.scan.coredao.org/api", // probably wrong
          browserURL: "https://scan.coredao.org",
        },
      },
      {
        network: "coredao",
        chainId: 1115,
        urls: {
          apiURL: "https://api.scan.test.btcs.network/api", // probably wrong
          browserURL: "https://scan.test.btcs.network",
        },
      },
      {
        network: "autobahn",
        chainId: 45000,
        urls: {
          apiURL: "https://autobahn-explorer.com/api",
          browserURL: "https://autobahn-explorer.com",
        },
      },
      {
        network: "autobahnTestnet",
        chainId: 45001,
        urls: {
          apiURL: "https://testnet.autobahn-explorer.com/api",
          browserURL: "https://testnet.autobahn-explorer.com",
        },
      },
      {
        network: "chiado",
        chainId: 10200,
        urls: {
          apiURL: "https://blockscout.chiadochain.net/api",
          browserURL: "https://blockscout.chiadochain.net",
        },
      },
      {
        network: "cronos",
        chainId: 25,
        urls: {
          apiURL: "https://api.cronoscan.com/api",
          browserURL: "https://cronoscan.com",
        },
      },
      {
        network: "cronosTestnet",
        chainId: 338,
        urls: {
          apiURL: "https://api-testnet.cronoscan.com/api",
          browserURL: "https://testnet.cronoscan.com",
        },
      },
      {
        network: "fuse",
        chainId: 122,
        urls: {
          apiURL: "https://explorer.fuse.io/api",
          browserURL: "https://explorer.fuse.io",
        },
      },
      {
        network: "spark",
        chainId: 123,
        urls: {
          apiURL: "https://explorer.fusespark.io/api",
          browserURL: "https://explorer.fusespark.io",
        },
      },
      {
        network: "evmos",
        chainId: 9001,
        urls: {
          apiURL: "https://evm.evmos.org/api",
          browserURL: "https://evm.evmos.org",
        },
      },
      {
        network: "evmosTestnet",
        chainId: 9000,
        urls: {
          apiURL: "https://evm.evmos.dev/api",
          browserURL: "https://evm.evmos.dev",
        },
      },
      {
        network: "boba",
        chainId: 288,
        urls: {
          apiURL: "https://api.bobascan.com/api",
          browserURL: "https://bobascan.com",
        },
      },
      {
        network: "bobaTestnet",
        chainId: 2888,
        urls: {
          apiURL: "https://api-testnet.bobascan.com/api",
          browserURL: "https://testnet.bobascan.com",
        },
      },
      {
        network: "arbitrumNova",
        chainId: 42170,
        urls: {
          apiURL: "https://api-nova.arbiscan.io/api",
          browserURL: "https://nova.arbiscan.io",
        },
      },
      {
        network: "arbitrumTestnet",
        chainId: 421613,
        urls: {
          apiURL: "https://api-goerli.arbiscan.io",
          browserURL: "https://goerli.arbiscan.io",
        },
      },
      {
        network: "canto",
        chainId: 7700,
        urls: {
          apiURL: "https://evm.explorer.canto.io/api",
          browserURL: "https://evm.explorer.canto.io",
        },
      },
      {
        network: "cantoTestnet",
        chainId: 7701,
        urls: {
          apiURL: "https://testnet-explorer.canto.neobase.one/api",
          browserURL: "https://testnet-explorer.canto.neobase.one",
        },
      },
      {
        network: "baseTestnet",
        chainId: 84531,
        urls: {
          apiURL: "https://api-goerli.basescan.org/api",
          browserURL: "https://goerli.basescan.org",
        },
      },
      {
        network: "mantleTestnet",
        chainId: 5001,
        urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz",
        },
      },
      {
        network: "scrollTestnet",
        chainId: 534353,
        urls: {
          apiURL: "https://blockscout.scroll.io/api",
          browserURL: "https://blockscout.scroll.io",
        },
      },
      {
        network: "polygonZkEVM",
        chainId: 1101,
        urls: {
          apiURL: "https://api-zkevm.polygonscan.com/api",
          browserURL: "https://zkevm.polygonscan.com",
        },
      },
      {
        network: "polygonZkEVMTestnet",
        chainId: 1442,
        urls: {
          apiURL: "https://api-testnet-zkevm.polygonscan.com/api",
          browserURL: "https://testnet-zkevm.polygonscan.com",
        },
      },
      {
        network: "lineaTestnet",
        chainId: 59140,
        urls: {
          apiURL: "https://explorer.goerli.linea.build/api",
          browserURL: "https://explorer.goerli.linea.build",
        },
      },
      {
        network: "shimmerEVMTestnet",
        chainId: 1071,
        urls: {
          apiURL: "https://explorer.evm.testnet.shimmer.network/api",
          browserURL: "https://explorer.evm.testnet.shimmer.network",
        },
      },
    ],
  },
};

export default config;
