/**
 * Create a new Switchboard Queue
 */
import { RPC, SWITCHBOARD_ADDRESS } from "./common";

import {
  Connection,
  Ed25519Keypair,
  fromB64,
  JsonRpcProvider,
  MIST_PER_SUI,
  RawSigner,
  TransactionBlock,
} from "@mysten/sui.js";
import { execSync } from "child_process";
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

    console.log(`User account ${userAddress} loaded.`);

    const compiledResult: { modules: string[]; dependencies: string[] } =
      JSON.parse(
        execSync(
          "sui move build --path '../switchboard' --dump-bytecode-as-base64",
          {
            encoding: "utf-8",
          }
        )
      );

    const txb = new TransactionBlock();
    const res = txb.publish(compiledResult);
    txb.transferObjects([res], txb.pure(userAddress));

    const signerWithProvider = new RawSigner(keypair, provider);

    const gas = await signerWithProvider.getGasCostEstimation({
      transactionBlock: txb,
    });

    console.log(gas);

    // const deploy = async () => {
    // const [provider, , signer] = prepareSigner (process.env. MNEMONIC) ;

    // try {
    // / Prepare a transaction block
    // let txb = new TransactionBlock() ;
    // txb.publish (compiledResult);
    // / Execute this transaction block and analyze the response
    // let gas = await signer.getGasCostEstimation ({ transactionBlock: txb });
    // txb.setGasBudget (gas) ;
    // const tResponse = await signer. signAndExecuteTransactionBlock({
    // transactionBlock: txb,
    // options: { showEffects: true, showEvents: true }, requestType: "WaitForEffectsCert"
    // })R
    // if (tResponse.effects?.status?.status === "failure") {
    // console. log ("ERROR",
  } catch (e) {
    console.log("errored out", e);
  }
})();
