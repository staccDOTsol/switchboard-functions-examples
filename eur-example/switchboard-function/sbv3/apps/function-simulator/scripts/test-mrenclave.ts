/* eslint-disable */

import * as sb from "../ts/index.js";

async function main() {
  // Paste this into the browser to test the websocket connection

  const message: sb.MsgInMeasurement = {
    event: "measurement",
    data: {
      container:
        process.argv.length > 2 ? process.argv[2] : "gallynaut/binance-oracle",
      // containerRegistry: "dockerhub",
      // version: "latest",
    },
  };
  const payload = JSON.stringify(message.data, undefined, 2);

  const response = await fetch("https://functions.switchboard.xyz/mrenclave", {
    method: "POST",
    body: payload,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": payload.length.toString(),
    },
  });
  if (response.ok) {
    const result: sb.MsgOutMeasurementData = JSON.parse(await response.text());
    console.log(JSON.stringify(result, undefined, 2));
  } else {
    console.error("ERROR:", "status=", response.status, await response.text());
  }
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    throw err;
  });
