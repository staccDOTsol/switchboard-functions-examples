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
    for (const feed of feeds) {
      const aggregator = new AggregatorAccount(
        provider,
        feed,
        SWITCHBOARD_ADDRESS
      );
      const [coin] = txb.splitCoins(txb.gas, [txb.pure(3_000_000_000)]);
      txb.moveCall({
        target: `${SWITCHBOARD_ADDRESS}::aggregator_escrow_deposit_action::run`,
        arguments: [
          txb.object(TESTNET_QUEUE),
          txb.object(feed),
          coin,
          txb.pure(1_000_000_000),
        ],
        typeArguments: ["0x2::sui::SUI"],
      });
      txb.transferObjects(
        [coin],
        txb.pure(keypair.getPublicKey().toSuiAddress())
      );
    }
    const signerWithProvider = new RawSigner(keypair, provider);
    const tx = await sendSuiTx(signerWithProvider, txb);
    console.log(`Aggregators extended`, tx);
  } catch (e) {
    console.log("errored out from the start", e);
  }
})();
