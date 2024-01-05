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
  RawSigner,
  TransactionBlock,
} from "@mysten/sui.js";
import { OracleJob } from "@switchboard-xyz/common";
import {
  AggregatorAccount,
  createFeed,
  OracleQueueAccount,
  sendSuiTx,
  SuiDecimal,
} from "@switchboard-xyz/sui.js";
import Big from "big.js";
import { Buffer } from "buffer";
import * as fs from "fs";

/// Feed owner
// 0xd11bccc5686ed361cf72c6d72ce00bfcb333e5449af0078e96085f9517d5a757

/// BTC/USD  - 0xe32e4e03cccdc3c178d4f0c1bbe54108d6ed1d94e4f5453e510aebab21b1168a
/// ETH/USD  - 0x9f1dfee177dd50a757f72c045ed85cd80c83e9f2d296a5e7eb5eee29d8137a68
/// USDC/USD - 0xa2d27e0f29b71a5b5f0e5b93f5a7a4da2c3bb0c8332bb4ce22236086d707bf50
/// USDT/USD - 0xd11bccc5686ed361cf72c6d72ce00bfcb333e5449af0078e96085f9517d5a757;

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

    const feeds = [
      "0xe32e4e03cccdc3c178d4f0c1bbe54108d6ed1d94e4f5453e510aebab21b1168a",
      "0x9f1dfee177dd50a757f72c045ed85cd80c83e9f2d296a5e7eb5eee29d8137a68",
      "0xa2d27e0f29b71a5b5f0e5b93f5a7a4da2c3bb0c8332bb4ce22236086d707bf50",
      "0xdc548069b8a92348fe90cfa74b399f8b7e622308a192a3228e4dc1c173d2f737",
    ];

    const txb = new TransactionBlock();
    for (const feedAddress of feeds) {
      const aggregator = new AggregatorAccount(
        provider,
        feedAddress,
        SWITCHBOARD_ADDRESS
      );
      const feed = await aggregator.loadData();
      const { mantissa: vtMantissa, scale: vtScale } = SuiDecimal.fromBig(
        new Big(0.5) // 0.5% variance threshold
      );
      txb.moveCall({
        target: `${SWITCHBOARD_ADDRESS}::aggregator_set_configs_action::run`,
        arguments: [
          txb.object(feedAddress),
          txb.pure(feed.name),
          txb.object(feed.queue_addr),
          txb.pure(1), // batch size
          txb.pure(1), // min oracle results
          txb.pure(2), // min job results
          txb.pure(30), // min update delay seconds 30 seconds
          txb.pure(vtMantissa, "u128"),
          txb.pure(vtScale, "u8"),
          txb.pure(500), // force report period
          txb.pure(false), // disable crank
          txb.pure(0), // history size
          txb.pure(0), // read charge
          txb.pure(feed.reward_escrow),
          txb.pure([]), // + read whitelist
          txb.pure([]), // - read whitelist
          txb.pure(false), // limit reads to whitelist
        ],
        typeArguments: ["0x2::sui::SUI"],
      });
    }
    const signerWithProvider = new RawSigner(keypair, provider);
    const tx = await sendSuiTx(signerWithProvider, txb);
    console.log(`Aggregators configs updated`, tx);
  } catch (e) {
    console.log("errored out from the start", e);
  }
})();
