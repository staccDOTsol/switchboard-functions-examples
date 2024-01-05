/* eslint-disable */

import WebSocket from "ws";
import * as sb from "../ts/index.js";
import { argv } from "process";

async function main() {
  const functionPubkey =
    argv.length > 2 ? argv[2] : "Accb21tUCWocJea6Uk3DgrNZawgmKegDVeHw8cGMDPi5";

  const message: sb.MsgInSolanaSimulate = {
    event: "solanaSimulate",
    data: {
      fnKey: functionPubkey,
      cluster: "Devnet",
      // params: {
      //   container: "gallynaut/binance-oracle",
      //   containerRegistry: "dockerhub",
      //   version: "latest",
      // },
    },
  };

  const ws = new WebSocket(sb.SIMULATION_SERVER_URL);
  console.log(`Connecting to ${ws.url} ...`);

  ws.onopen = (event) => {
    console.log(`sending message - ${JSON.stringify(message, undefined, 2)}`);
    ws.send(JSON.stringify(message));
  };

  ws.onerror = (event) => {
    console.error(`Error: ${event.message}`);
    console.error(event.error);
  };

  ws.onmessage = (event) => {
    const message = event.data.toString("utf-8");
    console.log(message);
    if (message.startsWith("{") && message.endsWith("}")) {
      const response: sb.MsgOut = JSON.parse(message);
      if (response.event === "solanaSimulate") {
        // ws.terminate();
        ws.close();
        process.exit(0);
      }
    }
    /**
     * Building container for dockerhub image gallynaut/binance-oracle:latest
     * Starting container ...
     * starting enclave..
     *
     * thread 'main' panicked at 'called `result::unwrap()` on an `err` value: envvariablemissing("function_key")',
     *    src/main.rs:14:90
     *
     * note: run with `rust_backtrace=1` environment variable to display a backtrace
     *
     * {
     *  "event":"solanaSimulate",
     *  "data": {
     *      "id": "testing stuff",
     *      "result": null,
     *      "error": "Failed to find the FN_OUT result in the emitted logs",
     *      "logs": []
     *   }
     * }
     */
  };

  ws.onclose = (event) => {
    console.log(`Websocket closed with code ${event.code}: ${event.reason}`);
    process.exit(event.code);
  };
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    throw err;
  });

// const connection = new Connection(
//   "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14"
// );
// const program = await SwitchboardProgram.load("devnet", connection);

// const functionAccount = new FunctionAccount(
//   program,
//   new PublicKey(functionPubkey)
// );

// const functionAccountInfo = await connection.getAccountInfo(
//   functionAccount.publicKey
// );

// const [_, functionState] = await FunctionAccount.decode(
//   program,
//   functionAccountInfo!
// );

// // console.log(`ATT QUEUE: ${functionState.attestationQueue}`);

// const function_data = `${functionAccountInfo
//   ?.data!.slice(8)
//   .toString("hex")}`;
// console.log(`FUNCTION_DATA: ${function_data}`);
