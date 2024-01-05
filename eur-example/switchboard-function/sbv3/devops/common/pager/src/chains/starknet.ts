import { RpcProvider, Contract } from "starknet";
import { PagerResult } from "../index";

const ETH_ADDRESS =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const RPC_MAINNET =
  "https://starknet-mainnet.infura.io/v3/01c29215e2f2486e8480edf1d74903bf";
const RPC_TESTNET =
  "https://starknet-goerli.infura.io/v3/01c29215e2f2486e8480edf1d74903bf";
const ERC20_ABI = [
  {
    members: [
      {
        name: "low",
        offset: 0,
        type: "felt",
      },
      {
        name: "high",
        offset: 1,
        type: "felt",
      },
    ],
    name: "Uint256",
    size: 2,
    type: "struct",
  },
  {
    inputs: [
      {
        name: "name",
        type: "felt",
      },
      {
        name: "symbol",
        type: "felt",
      },
      {
        name: "recipient",
        type: "felt",
      },
    ],
    name: "constructor",
    outputs: [],
    type: "constructor",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        name: "name",
        type: "felt",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        name: "symbol",
        type: "felt",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        name: "totalSupply",
        type: "Uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [
      {
        name: "decimals",
        type: "felt",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        name: "account",
        type: "felt",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        name: "balance",
        type: "Uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        name: "owner",
        type: "felt",
      },
      {
        name: "spender",
        type: "felt",
      },
    ],
    name: "allowance",
    outputs: [
      {
        name: "remaining",
        type: "Uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        name: "recipient",
        type: "felt",
      },
      {
        name: "amount",
        type: "Uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        name: "success",
        type: "felt",
      },
    ],
    type: "function",
  },
  {
    inputs: [
      {
        name: "sender",
        type: "felt",
      },
      {
        name: "recipient",
        type: "felt",
      },
      {
        name: "amount",
        type: "Uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        name: "success",
        type: "felt",
      },
    ],
    type: "function",
  },
  {
    inputs: [
      {
        name: "spender",
        type: "felt",
      },
      {
        name: "amount",
        type: "Uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        name: "success",
        type: "felt",
      },
    ],
    type: "function",
  },
  {
    inputs: [
      {
        name: "spender",
        type: "felt",
      },
      {
        name: "added_value",
        type: "Uint256",
      },
    ],
    name: "increaseAllowance",
    outputs: [
      {
        name: "success",
        type: "felt",
      },
    ],
    type: "function",
  },
  {
    inputs: [
      {
        name: "spender",
        type: "felt",
      },
      {
        name: "subtracted_value",
        type: "Uint256",
      },
    ],
    name: "decreaseAllowance",
    outputs: [
      {
        name: "success",
        type: "felt",
      },
    ],
    type: "function",
  },
  {
    inputs: [
      {
        name: "recipient",
        type: "felt",
      },
      {
        name: "amount",
        type: "Uint256",
      },
    ],
    name: "mint",
    outputs: [],
    type: "function",
  },
  {
    inputs: [
      {
        name: "user",
        type: "felt",
      },
      {
        name: "amount",
        type: "Uint256",
      },
    ],
    name: "burn",
    outputs: [],
    type: "function",
  },
];

const PUSH_RECEIVER_ABI = [
  {
    type: "impl",
    name: "UpgradeableImpl",
    interface_name: "openzeppelin::upgrades::interface::IUpgradeable",
  },
  {
    type: "interface",
    name: "openzeppelin::upgrades::interface::IUpgradeable",
    items: [
      {
        type: "function",
        name: "upgrade",
        inputs: [
          {
            name: "new_class_hash",
            type: "core::starknet::class_hash::ClassHash",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
    ],
  },
  {
    type: "impl",
    name: "OwnableImpl",
    interface_name: "openzeppelin::access::ownable::interface::IOwnable",
  },
  {
    type: "interface",
    name: "openzeppelin::access::ownable::interface::IOwnable",
    items: [
      {
        type: "function",
        name: "owner",
        inputs: [],
        outputs: [
          { type: "core::starknet::contract_address::ContractAddress" },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "transfer_ownership",
        inputs: [
          {
            name: "new_owner",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "renounce_ownership",
        inputs: [],
        outputs: [],
        state_mutability: "external",
      },
    ],
  },
  {
    type: "impl",
    name: "AccessControlImpl",
    interface_name:
      "openzeppelin::access::accesscontrol::interface::IAccessControl",
  },
  {
    type: "enum",
    name: "core::bool",
    variants: [
      { name: "False", type: "()" },
      { name: "True", type: "()" },
    ],
  },
  {
    type: "interface",
    name: "openzeppelin::access::accesscontrol::interface::IAccessControl",
    items: [
      {
        type: "function",
        name: "has_role",
        inputs: [
          { name: "role", type: "core::felt252" },
          {
            name: "account",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_role_admin",
        inputs: [{ name: "role", type: "core::felt252" }],
        outputs: [{ type: "core::felt252" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "grant_role",
        inputs: [
          { name: "role", type: "core::felt252" },
          {
            name: "account",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "revoke_role",
        inputs: [
          { name: "role", type: "core::felt252" },
          {
            name: "account",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "renounce_role",
        inputs: [
          { name: "role", type: "core::felt252" },
          {
            name: "account",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
    ],
  },
  {
    type: "impl",
    name: "AdminLibExternal",
    interface_name:
      "switchboard_price_oracle::components::admin::IExternalAdminLib",
  },
  {
    type: "interface",
    name: "switchboard_price_oracle::components::admin::IExternalAdminLib",
    items: [
      {
        type: "function",
        name: "set_function_address",
        inputs: [
          {
            name: "function_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "get_function_address",
        inputs: [],
        outputs: [
          { type: "core::starknet::contract_address::ContractAddress" },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "impl",
    name: "ReceiverImpl",
    interface_name:
      "switchboard_price_oracle::components::receiver::IExternalReceiverLib",
  },
  {
    type: "struct",
    name: "switchboard_price_oracle::components::receiver::Feed",
    members: [
      { name: "value", type: "core::integer::u128" },
      { name: "timestamp", type: "core::integer::u64" },
      { name: "reported_timestamp", type: "core::integer::u64" },
      { name: "feed_id", type: "core::felt252" },
    ],
  },
  {
    type: "interface",
    name: "switchboard_price_oracle::components::receiver::IExternalReceiverLib",
    items: [
      {
        type: "function",
        name: "update_price",
        inputs: [
          { name: "feed_id", type: "core::felt252" },
          { name: "value", type: "core::integer::u128" },
          { name: "reported_timestamp", type: "core::integer::u64" },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "get_feeds",
        inputs: [],
        outputs: [
          {
            type: "core::array::Array::<switchboard_price_oracle::components::receiver::Feed>",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_feed",
        inputs: [{ name: "feed_id", type: "core::felt252" }],
        outputs: [
          { type: "switchboard_price_oracle::components::receiver::Feed" },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "constructor",
    name: "constructor",
    inputs: [
      {
        name: "owner",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
  },
];

const MAINNET_PAYER =
  "0x03ad5e448b0a5769139caed5d29baac43869e5340e667ee738330aadee371c43";
const MAINNET_ESCROW =
  "0x030c931e219f93bd381202833f8bb1339b4d64a485f6c9b6124ace07fa9c3b77";
const MAINNET_PUSH_RECEIVER =
  "0x02b5ebc4a7149600ca4890102bdb6b7d6daac2fbb9d9ccd01f7198ca29107ec4";

const TESTNET_PAYER =
  "0x51d79c0798176ee34147ad5465069a53eb2e1eecd09be69a8e1f274884f52a7";
const TESTNET_ESCROW =
  "0x01c3a6043c1d2891068b78f00f4a51761bc3161186f3c59fb401e83a8ac4e4ca";
const TESTNET_PUSH_RECEIVER =
  "0x014d660768cb98256ceb18d821fd02fd1b54b6028679ceca3dbe03389228f285";

export async function starknetAction(
  minBalance: BigInt,
  stalenessThreshold: number,
  network?: "mainnet" | "testnet"
): Promise<PagerResult> {
  if (network === "mainnet" || !network) {
    //================================================================================================
    // Mainnet checks
    //================================================================================================
    const mainnetProvider = new RpcProvider({
      nodeUrl: RPC_MAINNET,
    });
    const erc20Mainnet = new Contract(ERC20_ABI, ETH_ADDRESS, mainnetProvider);
    const mainnetEscrowBalance = await erc20Mainnet.balanceOf(MAINNET_ESCROW);
    const mainnetPayerBalance = await erc20Mainnet.balanceOf(MAINNET_PAYER);
    const mainnetPushReceiver = new Contract(
      PUSH_RECEIVER_ABI,
      MAINNET_PUSH_RECEIVER,
      mainnetProvider
    );
    const mainnetFeeds = await mainnetPushReceiver.get_feeds();
    const mainnetFeedTimestamp: any = mainnetFeeds[0].timestamp;

    const mainnetStaleness = Math.floor(
      (Date.now() - Number(mainnetFeedTimestamp) * 1000) / 1000
    );

    if (mainnetEscrowBalance.balance.low < minBalance) {
      return {
        shouldPage: true,
        account: MAINNET_ESCROW,
        amount: mainnetEscrowBalance,
        type: "balance",
        message: `Mainnet Escrow Balance: ${mainnetEscrowBalance.balance.low}`,
      };
    }

    if (mainnetPayerBalance.balance.low < minBalance) {
      return {
        shouldPage: true,
        account: MAINNET_PAYER,
        amount: mainnetPayerBalance,
        type: "balance",
        message: `Mainnet Payer Balance: ${mainnetEscrowBalance.balance.low}`,
      };
    }

    if (mainnetStaleness > stalenessThreshold) {
      return {
        shouldPage: true,
        account: MAINNET_PUSH_RECEIVER,
        amount: mainnetStaleness,
        type: "staleness",
        message: `Mainnet staleness: ${mainnetStaleness}`,
      };
    }
  }

  if (network === "testnet" || !network) {
    //================================================================================================
    // Testnet checks
    //================================================================================================
    const testnetProvider = new RpcProvider({
      nodeUrl: RPC_TESTNET,
    });
    const erc20Testnet = new Contract(ERC20_ABI, ETH_ADDRESS, testnetProvider);
    const testnetEscrowBalance = await erc20Testnet.balanceOf(TESTNET_ESCROW);
    const testnetPayerBalance = await erc20Testnet.balanceOf(TESTNET_PAYER);
    const testnetPushReceiver = new Contract(
      PUSH_RECEIVER_ABI,
      TESTNET_PUSH_RECEIVER,
      testnetProvider
    );
    const testnetFeeds = await testnetPushReceiver.get_feeds();
    const testnetFeedTimestamp: any = testnetFeeds[0].timestamp;
    const testnetStaleness =
      Math.floor(Date.now() / 1000) - Number(testnetFeedTimestamp);

    if (testnetEscrowBalance.balance.low < minBalance) {
      return {
        shouldPage: true,
        account: TESTNET_ESCROW,
        amount: testnetEscrowBalance,
        type: "balance",
        message: `Testnet Escrow Balance: ${testnetEscrowBalance.balance.low}`,
      };
    }

    if (testnetPayerBalance.balance.low < minBalance) {
      return {
        shouldPage: true,
        account: TESTNET_PAYER,
        amount: testnetPayerBalance,
        type: "balance",
        message: `Testnet Payer Balance: ${testnetEscrowBalance.balance.low}`,
      };
    }

    if (testnetStaleness > stalenessThreshold) {
      return {
        shouldPage: true,
        account: TESTNET_PUSH_RECEIVER,
        amount: testnetStaleness,
        type: "staleness",
        message: `Testnet staleness: ${testnetStaleness}`,
      };
    }
  }

  // RETURN DEFAULT IF NOT PAGING
  return {
    shouldPage: false,
    account: "",
    amount: 0,
    type: "balance",
    message: "",
  };
}

(async () => {
  // 0.01 ETH
  const result = await starknetAction(10_000_000_000_000_000n, 5000);
  console.log(result);
})();
