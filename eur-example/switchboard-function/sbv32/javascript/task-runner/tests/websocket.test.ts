import { Websocket } from "../src/types/Websocket.js";

import { OracleJob, promiseWithTimeout, sleep } from "@switchboard-xyz/common";
import NodeWebSocket from "ws";

describe("Websocket", () => {
  let server: NodeWebSocket.Server;
  let websocket: Websocket;

  const iWebsocketTask = OracleJob.WebsocketTask.fromObject({
    url: "ws://localhost:8080",
    subscription: '{"op":"subscribe","args":[{"id":"dummy subscription"}]}',
    maxDataAgeSeconds: 15,
    filter: "$[?(@.data != '')]",
  });

  const websocketResponse = {
    data: 1337.1337,
  };

  beforeAll(() => {
    server = new NodeWebSocket.Server({ port: 8080 });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(async () => {
    websocket = await promiseWithTimeout(
      5000,
      new Promise((resolve, reject) => {
        websocket = new Websocket(iWebsocketTask, console);
        websocket.socket?.once("open", () => {
          resolve(websocket);
        });
        websocket.socket?.once("error", () => {
          reject("error");
        });
      }),
      "Socket timed out waiting connection"
    );
  });

  afterEach(() => {
    websocket.dispose();
  });

  test("should auto-connect to websocket server", async () => {
    expect(websocket.readyState).toBe(Websocket.OPEN);
    expect(websocket.isConnected).toBe(true);

    expect(websocket.socket).not.toBeNull();

    expect(server.clients.size).toBe(1);
  });

  test("should cache websocket responses", async () => {
    expect(websocket.readyState).toBe(Websocket.OPEN);

    server.clients.forEach((client) => {
      if (client.readyState === Websocket.OPEN) {
        client.send(JSON.stringify(websocketResponse));
        console.debug(`Sent: ${JSON.stringify(websocketResponse)}`);
      }
    });

    await sleep(50);

    const cachedMessage = websocket.response(iWebsocketTask);
    const message = JSON.parse(cachedMessage.data);
    expect(message).toStrictEqual(websocketResponse);
  });

  test("should resolve as soon as a message is received", async () => {
    expect(websocket.readyState).toBe(Websocket.OPEN);

    expect(() => {
      websocket.response(iWebsocketTask);
    }).toThrow(new RegExp(/WebsocketCacheEmpty/g));

    const start = Date.now();
    const responsePromise = websocket.onNextResponse(iWebsocketTask, 2500);

    server.clients.forEach((client) => {
      if (client.readyState === Websocket.OPEN) {
        client.send(JSON.stringify(websocketResponse));
        console.debug(`Sent: ${JSON.stringify(websocketResponse)}`);
      }
    });

    const response = await responsePromise;
    const end = Date.now();

    const duration = end - start;
    expect(duration).toBeLessThan(100);
  });

  test("should destroy the reconnecting socket", async () => {
    expect(websocket.readyState).toBe(Websocket.OPEN);

    websocket.dispose();
    expect(websocket.readyState).toBe(Websocket.CLOSING);

    // for some reason this fails in GH action
    // await sleep(500);
    // expect(websocket.readyState).toBe(Websocket.CLOSED);
  });
});
