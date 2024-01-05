/* eslint-disable */

import WebSocket from "ws";
import * as sb from "../ts/index.js";

async function main() {
  // Paste this into the browser to test the websocket connection
  const ws = new WebSocket(sb.SIMULATION_SERVER_URL);

  const message: sb.MsgInMeasurement = {
    event: "measurement",
    data: {
      containerRegistry: "dockerhub",
      container: "gallynaut/binance-oracle",
      version: "latest",
    },
  };
  ws.onopen = (event) => {
    console.log(`sending message - ${JSON.stringify(message, undefined, 2)}`);
    ws.send(JSON.stringify(message));
  };

  ws.onmessage = (event) => {
    const message = event.data.toString("utf-8");
    console.log(message);
    console.log(message);
    if (message.startsWith("{") && message.endsWith("}")) {
      const response: sb.MsgOut = JSON.parse(message);
      if (response.event === "measurement") {
        // ws.terminate();
        ws.close();
        process.exit(0);
      }
    }
    /**
     * Building dockerhub container for image gallynaut/binance-oracle:latest
     * Fetching measurement for container gallynaut/binance-oracle:latest
     * Measurement for gallynaut/binance-oracle:latest:latest = 0xadd79ba123e1b9350a80c35935d53e36bfe634d86172deb391d7c73a17af038c
     * {
     *    "event":"measurement",
     *    "data": {
     *        "container_registry": "dockerhub",
     *        "container": "gallynaut/binance-oracle",
     *        "version": "latest",
     *        "mr_enclave": "0xadd79ba123e1b9350a80c35935d53e36bfe634d86172deb391d7c73a17af038c"
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
