declare module "ws-reconnect" {
  import { EventEmitter } from "events";
  import type { WebSocket } from "ws";
  //   export function WSRECONNECT(url: string, options?: any): WSRECONNECT;
  export default class WSRECONNECT extends EventEmitter {
    constructor(url: string, options?: any);
    url: string;
    options: any;
    socket: WebSocket;
    isConnected: boolean;
    reconnectTimeoutId: number;
    retryCount: number;
    _retryCount: number;
    reconnectInterval: number;
    shouldAttemptReconnect: boolean;
    start(): void;
    destroy(): void;
    onError(reason: any): void;
    onOpen(): void;
    onClose(reason: any): void;
    onMessage(message: any): void;
    send(message: any): void;
  }
}
