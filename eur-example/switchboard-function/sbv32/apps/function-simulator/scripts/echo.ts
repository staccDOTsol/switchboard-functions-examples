/* eslint-disable */

import WebSocket from "ws";
import * as sb from "../ts/index.js";

async function main() {
  // Paste this into the browser to test the websocket connection
  const ws = new WebSocket(sb.SIMULATION_SERVER_URL);

  const message: sb.MsgInEcho = {
    event: "echo",
    data: {
      message: "echo this message back to me",
    },
  };

  ws.onopen = (event) => {
    console.log(`sending echo`);
    ws.send(JSON.stringify(message));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data.toString("utf-8"));
    console.log("received msg", msg);
    process.exit(0);
  };
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    throw err;
  });
