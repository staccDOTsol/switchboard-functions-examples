/* eslint-disable */

import WebSocket from "ws";
import * as sb from "../ts/index.js";

async function main() {
  // Paste this into the browser to test the websocket connection
  const ws = new WebSocket(sb.SIMULATION_SERVER_URL);

  const message: sb.MsgInContainerVerify = {
    event: "containerVerify",
    data: {
      container: "gallynaut/binance-oracle",
    },
  };

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
      if (response.event === "containerVerify") {
        // ws.terminate();
        ws.close();
        process.exit(0);
      }
    }
    /**
     * Building dockerhub container for image gallynaut/binance-oracle:latest
     * {
     *    "event":"container_verify",
     *    "data": {
     *        "container_registry": "dockerhub",
     *        "container": "gallynaut/binance-oracle",
     *        "version": "latest",
     *        "is_valid": true
     *    }
     * }
     */
  };
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    throw err;
  });
