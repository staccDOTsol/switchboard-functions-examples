import type { ITaskRunnerLogger } from "./types.js";

import type { OracleJob } from "@switchboard-xyz/common";
import { promiseWithTimeout } from "@switchboard-xyz/common";
import { JSONPath } from "jsonpath-plus";
import type { WebSocket } from "ws";
import WSRECONNECT from "ws-reconnect";

// from nodeJS websocket library
const readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];

export interface SocketCacheMessage {
  timestamp: number;
  data: string;
}

export class Websocket {
  url: string;
  _socket: WSRECONNECT;

  created = Date.now();
  lastReconnect = Date.now();

  private _subscriptions = new Set<string>();
  private _tasks = new Set<string>();
  private _responses = new Map<string, SocketCacheMessage>(); // filter to response

  private toKey(wsTask: OracleJob.IWebsocketTask): string {
    return `${wsTask.subscription!}::::${wsTask.filter!}`;
  }
  private fromKey(taskKey: string): { subscription: string; filter: string } {
    const [subscription, filter] = taskKey.split("::::", 2);
    return { subscription, filter };
  }

  get socket(): WebSocket | null {
    return this._socket.socket;
  }

  constructor(
    wsTask: OracleJob.IWebsocketTask,
    private logger: ITaskRunnerLogger = console
  ) {
    this.url = wsTask.url! ?? "";
    const taskKey = this.toKey(wsTask);
    this._tasks.add(taskKey);
    this._subscriptions.add(wsTask.subscription!);

    this._socket = new WSRECONNECT(wsTask.url!, {
      retryCount: 10,
      reconnectInterval: 3,
    });
    logger.debug(`Websocket Created: socket ${wsTask.url}`);

    this._socket.on("connect", () => {
      logger.debug(`Websocket Connected: socket ${wsTask.url} connected`);
      this.resubscribe();
      this.lastReconnect = Date.now();
    });
    this._socket.on("reconnect", () => {
      // TODO(mgild): possible subscription duplication here. Remove.
      logger.debug(`Websocket Reconnected: socket ${wsTask.url} connected`);
      this.resubscribe();
      this.lastReconnect = Date.now();
    });
    this._socket.on("message", (data: any) => {
      this._tasks.forEach(async (task: string) => {
        try {
          const now = Date.now();
          const filter = this.fromKey(task).filter;

          const cachedMessage = this._responses.get(filter);

          if (cachedMessage && cachedMessage.timestamp >= now - 2500) {
            return;
          }

          const filterResult = JSONPath({
            json: [JSON.parse(data)],
            path: filter,
          });

          if (filterResult.length !== 0) {
            this.setResponse(task, {
              data: data,
              timestamp: now,
            });
            // this._responses.set(task, {
            //   data: data,
            //   timestamp: now,
            // });
          }
        } catch (e) {
          // logger.warn(e);
        }
      });
    });
    this._socket.on("destroyed", () => {
      // logger.debug(`Websocket Destroyed: socket ${wsTask.url}`);
    });
    this._socket.start();
  }

  get readyState(): number {
    return this.socket?.readyState ?? 0;
  }

  get readyStateString(): string {
    return readyStates[this.readyState];
  }

  get isConnected(): boolean {
    return this.readyState === Websocket.OPEN;
  }

  /** Fetch the last valid response from the response cache */
  get lastResponse(): number {
    const lastResponse = Array.from(this._responses).reduce(
      (prev, curr) => (curr[1].timestamp > prev ? curr[1].timestamp : prev),
      0
    );
    return lastResponse;
  }

  private setResponse(task: string, response: SocketCacheMessage) {
    this._responses.set(task, response);
    this._socket.emit("SetSocketCacheMessage", task, response);
  }

  public async onNextResponse(
    wsTask: OracleJob.IWebsocketTask,
    timeout = 1500
  ): Promise<SocketCacheMessage> {
    const taskKey = this.toKey(wsTask);

    let myListener:
      | undefined
      | ((task: string, response: SocketCacheMessage) => void) = undefined;

    const removeListener = () => {
      if (myListener) {
        this._socket.removeListener("SetSocketCacheMessage", myListener);
        myListener = undefined;
      }
    };

    const response = await promiseWithTimeout(
      timeout,
      new Promise((resolve: (value: SocketCacheMessage) => void) => {
        myListener = (task: string, response: SocketCacheMessage) => {
          if (task === taskKey) {
            // remove listener
            resolve(response);
          }
        };

        this._socket.on("SetSocketCacheMessage", myListener);
      }).finally(() => {
        removeListener();
      }),
      "WebsocketCacheStale"
    );

    removeListener();

    return response;
  }

  // if socket was created in the last 30s
  private get isNewSocket(): boolean {
    return Date.now() - this.created < 30_000;
  }

  // if no valid responses received in last 5 minutes
  get isStale(): boolean {
    const now = Date.now();
    const lastResponseStaleness = now - this.lastResponse;
    return !this.isNewSocket && lastResponseStaleness > 300_000; // might need to tighten
  }

  hasSubscription(wsTask: OracleJob.IWebsocketTask) {
    return (
      this._tasks.has(this.toKey(wsTask)) &&
      this._subscriptions.has(wsTask.subscription!)
    );
  }

  resubscribe() {
    if (this.isConnected) {
      this._subscriptions.forEach((s) => {
        this._socket.send(s);
        this.logger.debug(
          `Websocket Subscription: socket ${this.url} registered subscription ${s}`
        );

        // should we throw if we cant re-subscribe?
        // this should only be called when readyState is 1
      });
    }
  }

  register(wsTask: OracleJob.IWebsocketTask) {
    const taskKey = this.toKey(wsTask);
    if (!this._tasks.has(taskKey)) {
      this._tasks.add(taskKey);
    }
    if (!this._subscriptions.has(wsTask.subscription!)) {
      this._subscriptions.add(wsTask.subscription!);
      if (this.isConnected) {
        this._socket.send(wsTask.subscription!);
        this.logger.debug(
          `Websocket Subscription: socket ${
            this.url
          } registered subscription ${wsTask.subscription!}`
        );
      }
    }
  }

  response(wsTask: OracleJob.IWebsocketTask): SocketCacheMessage {
    const taskKey = this.toKey(wsTask);
    if (!this._responses.has(taskKey)) {
      throw new Error(`WebsocketCacheEmpty`);
    }

    const response = this._responses.get(taskKey)!;
    const ttlSeconds =
      wsTask.maxDataAgeSeconds && wsTask.maxDataAgeSeconds >= 15
        ? wsTask.maxDataAgeSeconds
        : 30;
    if (response.timestamp < Date.now() - ttlSeconds * 1000) {
      throw new Error(`WebsocketCacheStale`);
    }

    return response;
  }

  dispose() {
    if (this.socket && this.isConnected) {
      this._socket.destroy();
    }

    // this.socket?.removeAllListeners();
  }

  public static get CONNECTING(): number {
    return readyStates.indexOf("CONNECTING");
  }

  public static get OPEN(): number {
    return readyStates.indexOf("OPEN");
  }

  public static get CLOSING(): number {
    return readyStates.indexOf("CLOSING");
  }

  public static get CLOSED(): number {
    return readyStates.indexOf("CLOSED");
  }
}
