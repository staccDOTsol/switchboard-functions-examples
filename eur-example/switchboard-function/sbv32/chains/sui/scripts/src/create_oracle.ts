/**
 * Create a new Switchboard Oracle
 */
import { RPC, SWITCHBOARD_ADDRESS, TESTNET_QUEUE } from "./common";

import {
  Connection,
  Ed25519Keypair,
  fromB64,
  JsonRpcProvider,
} from "@mysten/sui.js";
import { createOracle, OracleQueueAccount } from "@switchboard-xyz/sui.js";
import * as fs from "fs";

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

    console.log(`User account ${userAddress} created.`);

    const queue = new OracleQueueAccount(
      provider,
      TESTNET_QUEUE,
      SWITCHBOARD_ADDRESS
    );

    const [oracle, oracleTxHash] = await createOracle(
      provider,
      keypair,
      {
        name: "Switchboard OracleAccount",
        authority: userAddress,
        queue: queue.address,
        loadAmount: 1, // 1 mist
        coinType: "0x2::sui::SUI",
      },
      SWITCHBOARD_ADDRESS
    );

    console.log("Created oracle address:", oracle.address);
    console.log("Created oracle tx hash:", oracleTxHash);
    console.log(await oracle.loadData());
  } catch (e) {
    console.log("errored out from the start", e);
  }
})();
