/**
 * Create a new Switchboard Queue, Oracle, Crank, and Aggregator
 */
import { aptBinance, aptCoinbase } from "./job_data/apt";
import { btcBinance, btcBitfinex, btcKraken } from "./job_data/btc";
import { ethBinance, ethBitfinex, ethKraken } from "./job_data/eth";
import { nearBinance, nearBitfinex } from "./job_data/near";
import * as solUsd from "./job_data/sol";
import { usdcBinance, usdcBitstamp, usdcKraken } from "./job_data/usdc";
import { usdtBitstamp, usdtBittrex, usdtKraken } from "./job_data/usdt";
import { RPC, SWITCHBOARD_ADDRESS, TESTNET_QUEUE } from "./common";

import {
  Connection,
  Ed25519Keypair,
  fromB64,
  JsonRpcProvider,
} from "@mysten/sui.js";
import { OracleJob } from "@switchboard-xyz/common";
import { createFeed, OracleQueueAccount } from "@switchboard-xyz/sui.js";
import Big from "big.js";
import { Buffer } from "buffer";
import * as fs from "fs";

/// Feed owner
// 0xd11bccc5686ed361cf72c6d72ce00bfcb333e5449af0078e96085f9517d5a757

/// BTC/USD  - 0xe32e4e03cccdc3c178d4f0c1bbe54108d6ed1d94e4f5453e510aebab21b1168a
/// ETH/USD  - 0x9f1dfee177dd50a757f72c045ed85cd80c83e9f2d296a5e7eb5eee29d8137a68
/// USDC/USD - 0xa2d27e0f29b71a5b5f0e5b93f5a7a4da2c3bb0c8332bb4ce22236086d707bf50
/// USDT/USD - 0x524c15a935d4c34474cdf2604ee42a6c47591d13c6ffb6b678f6b7eaffba12fe;

// run it all at once
(async () => {
  try {
    const connection = new Connection({
      fullnode: RPC,
    });
    // connect to Devnet
    const provider = new JsonRpcProvider(connection);
    let keypair: Ed25519Keypair | null = null;

    // if file extension ends with yaml
    try {
      const parsed = fs.readFileSync("./sui-secret.txt");
      const str = fromB64(parsed.toString()).slice(1);
      keypair = Ed25519Keypair.fromSecretKey(str);
    } catch (_e) {
      console.log(_e);
    }

    // create new user
    const userAddress = keypair.getPublicKey().toSuiAddress();

    console.log(`User account ${userAddress} loaded.`);

    const queue = new OracleQueueAccount(
      provider,
      TESTNET_QUEUE,
      SWITCHBOARD_ADDRESS
    );

    let [aggregator, createFeedTx] = await createFeed(
      provider,
      keypair,
      {
        name: "BTC/USD",
        authority: userAddress,
        queueAddress: queue.address,
        batchSize: 1,
        minJobResults: 1,
        minOracleResults: 1,
        minUpdateDelaySeconds: 30,
        varianceThreshold: new Big(0),
        forceReportPeriod: 0,
        coinType: "0x2::sui::SUI",
        initialLoadAmount: 1_000_000_000,
        jobs: [
          {
            name: "BTC/USD Binance",
            data: Array.from(btcBinance),
            weight: 1,
          },
          {
            name: "BTC/USD Bitfinex",
            data: Array.from(btcBitfinex),
            weight: 1,
          },
          {
            name: "BTC/USD Kraken",
            data: Array.from(btcKraken),
            weight: 1,
          },
        ],
      },
      SWITCHBOARD_ADDRESS
    );
    console.log(
      `Created BTC Aggregator Account ${aggregator.address}. Tx hash ${createFeedTx}`
    );

    [aggregator, createFeedTx] = await createFeed(
      provider,
      keypair,
      {
        name: "ETH/USD",
        authority: userAddress,
        queueAddress: queue.address,
        batchSize: 1,
        minJobResults: 1,
        minOracleResults: 1,
        minUpdateDelaySeconds: 30,
        varianceThreshold: new Big(0),
        forceReportPeriod: 0,
        coinType: "0x2::sui::SUI",
        initialLoadAmount: 1_000_000_000,
        jobs: [
          {
            name: "ETH/USD Binance",
            data: Array.from(ethBinance),
            weight: 1,
          },
          {
            name: "ETH/USD Bitfinex",
            data: Array.from(ethBitfinex),
            weight: 1,
          },
          {
            name: "ETH/USD Kraken",
            data: Array.from(ethKraken),
            weight: 1,
          },
        ],
      },
      SWITCHBOARD_ADDRESS
    );
    console.log(
      `Created ETH Aggregator Account ${aggregator.address}. Tx hash ${createFeedTx}`
    );

    [aggregator, createFeedTx] = await createFeed(
      provider,
      keypair,
      {
        name: "USDC/USD",
        authority: userAddress,
        queueAddress: queue.address,
        batchSize: 1,
        minJobResults: 1,
        minOracleResults: 1,
        minUpdateDelaySeconds: 30,
        varianceThreshold: new Big(0),
        forceReportPeriod: 0,
        coinType: "0x2::sui::SUI",
        initialLoadAmount: 1_000_000_000,
        jobs: [
          {
            name: "USDC/USD Binance",
            data: Array.from(usdcBinance),
            weight: 1,
          },
          {
            name: "USDC/USD Bitstamp",
            data: Array.from(usdcBitstamp),
            weight: 1,
          },
          {
            name: "USDC/USD Kraken",
            data: Array.from(usdcKraken),
            weight: 1,
          },
        ],
      },

      SWITCHBOARD_ADDRESS
    );
    console.log(
      `Created USDC Aggregator Account ${aggregator.address}. Tx hash ${createFeedTx}`
    );

    [aggregator, createFeedTx] = await createFeed(
      provider,
      keypair,
      {
        name: "USDT/USD",
        authority: userAddress,
        queueAddress: queue.address,
        batchSize: 1,
        minJobResults: 1,
        minOracleResults: 1,
        minUpdateDelaySeconds: 30,
        varianceThreshold: new Big(0),
        forceReportPeriod: 0,
        coinType: "0x2::sui::SUI",

        initialLoadAmount: 1_000_000_000,
        jobs: [
          {
            name: "USDT/USD Bitstamp",
            data: Array.from(usdtBitstamp),
            weight: 1,
          },
          {
            name: "USDT/USD Bittrex",
            data: Array.from(usdtBittrex),
            weight: 1,
          },
          {
            name: "USDT/USD Kraken",
            data: Array.from(usdtKraken),
            weight: 1,
          },
        ],
      },

      SWITCHBOARD_ADDRESS
    );
  } catch (e) {
    console.log("errored out from the start", e);
  }
})();
