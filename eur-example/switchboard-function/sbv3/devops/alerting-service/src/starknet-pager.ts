import { configList } from "./function";
import { Pager } from "./pager";
import {
  RpcProvider,
  Contract,
  Account,
  Call,
  Uint256,
  cairo,
  uint256,
} from "starknet";
import Big from "big.js";
import * as ethers from "ethers";

const ETH_ADDRESS =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
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

async function accountBalance(
  client: RpcProvider,
  address: string
): Promise<Number> {
  const erc20 = new Contract(ERC20_ABI, ETH_ADDRESS, client);
  const escrowBalance = await erc20.balanceOf(address);
  return new Big(uint256.uint256ToBN(escrowBalance.balance))
    .div(new Big(ethers.constants.WeiPerEther.toString()))
    .toNumber();
}

async function checkFeedHealth(
  minTillStale: number,
  network: string,
  pid: string
): Promise<any> {
  let feeds;
  const staleFeeds = [];
  const freshFeeds = [];
  try {
    const pushReceiver = new Contract(
      PUSH_RECEIVER_ABI,
      pid,
      await getProvider("starknet",network),
    );
    feeds = await pushReceiver.get_feeds();
    const secondsTillStale = minTillStale * 60;
    const feedTimestamp: any = feeds[0].timestamp;
    const staleness = Math.floor(
      (Date.now() - Number(feedTimestamp) * 1000) / 1000
    );

    /*
      {
        value: 2258665000000064534268n,
        timestamp: 1702531905n,
        reported_timestamp: 1702531951n,
        feed_id: 19514442401534788n
      }
    */
    if (staleness > secondsTillStale) {
      feeds.forEach((feed: any) => {
        staleFeeds.push({
          name: bigIntToUtf8(feed.feed_id),
          address: `${feed.feed_id}`,
          staleness: staleness,
        });
      });
    } else {
      feeds.forEach((feed: any) => {
        freshFeeds.push({
          name: bigIntToUtf8(feed.feed_id),
          address: `${feed.feed_id}`,
          staleness: staleness,
        });
      });
    }
  } catch (e) {
    console.error("error getting feeds:\n" + e);
  }
  // configList[chain][cluster].rpcs
  return {
    staleFeeds: staleFeeds,
    freshFeeds: freshFeeds,
    page: staleFeeds.length > 0,
  };
}

export const checkStarknetFeeds = async (
  minTillStale: number,
  nodeUrl: string,
  pid: string,
  network: string,
  chain: string
) => {
  const pager = new Pager(
    configList[chain][network].pdKey,
    `${chain} ${network} Alert v2: `,
    chain,
    network
  );
  const result = await checkFeedHealth(minTillStale, network, pid);
  if (result.page) {
    await pager.sendPage({
      error: "stale feeds",
      staleFeeds: result.staleFeeds,
    });
  }
  return result;
};

export async function checkStarknetBalance(
  network: string,
  address: string,
  chain: string
) {
  const rpcUrl = configList[chain][network].rpc;
  try {
    const balance = await accountBalance(
      await getProvider(chain,network),
      address
    );

    console.log(`balance of ${address} is ${balance}`);
    return balance;
  } catch (e) {
    console.error("error checking balance: " + e);
    return "error: " + e;
  }
}

export async function checkStarknetBalanceAndPage(
  network: string,
  address: string,
  threshold: Number,
  chain: string
) {
  const pager = new Pager(
    configList[chain][network].pdKey,
    `${chain} ${network} Alert v2: `,
    chain,
    network
  );
  const balance = await checkStarknetBalance(network, address, chain);
  console.log(balance);
  if (balance < threshold) {
    await pager.sendPage({
      error: `insufficient balance (${balance})`,
      address: address,
      balance: balance,
    });
  }
}

async function getProvider(chain: string, cluster: string) {
  console.log(`getting provider: ${chain}-${cluster}`);
  const rpcs = configList[chain][cluster].rpcs;
  for (let i = 0; i < rpcs.length; i++) {
    console.log("trying ", rpcs[i]);
    const provider = new RpcProvider({ nodeUrl: rpcs[i] });
    try {
      const height = await provider.getBlockLatestAccepted();
      console.log("height: ", height);
      return provider;
    } catch (e) {
      console.error("faulting endpoint: ", rpcs[i]);
      await new Pager(
        configList.starknet[cluster].pdKey,
        `RPC failure`,
        "starknet",
        cluster
      ).sendPage({ endpoint: rpcs[i] });
    }
  }
  throw "no working RPC endpoints";
}

export async function fundStarknetWallet(
  address: string,
  amount: Number,
  chain: string,
  network: string
) {
  const privateKey = process.env.STARKNET_WALLET_PRIVATE_KEY;
  const starknetFunderAddress = process.env.STARKNET_WALLET_ADDRESS;
  const provider = await getProvider(chain, network);
  const funder = new Account(provider, starknetFunderAddress, privateKey);
  const erc20 = new Contract(ERC20_ABI, ETH_ADDRESS, provider);
  erc20.connect(funder);

  try {
    const amountEth = ethers.utils.parseEther(amount.toString()).toBigInt();
    const toTransferTk: Uint256 = cairo.uint256(amountEth);
    const transferCallData: Call = erc20.populate("transfer", {
      recipient: address,
      amount: toTransferTk, // with Cairo 1 contract, 'toTransferTk' can be replaced by '10n'
    });
    const { transaction_hash: transferTxHash } = await erc20.transfer(
      transferCallData.calldata
    );

    // Wait for the invoke transaction to be accepted on Starknet
    console.log(`Waiting for Tx to be Accepted on Starknet - Transfer...`);
    const receipt = await provider.waitForTransaction(transferTxHash);
    return receipt;
  } catch (e) {
    return { error: e };
  }
}

function bigIntToUtf8(bigInt: bigint) {
  const bytes = [];
  while (bigInt > BigInt("0")) {
    bytes.push(Number(bigInt & BigInt("0xff")));
    bigInt >>= BigInt("8");
  }

  // If the BigInt was representing a UTF-8 string, it's likely that it was
  // big-endian, so we need to reverse the array
  const buffer = new Uint8Array(bytes.reverse());
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(buffer);
}
