import type {
  ICacheSetOptions,
  ITaskRunnerCache,
  ITaskRunnerLogger,
} from "../../types/types.js";
import { Websocket } from "../../types/Websocket.js";

import type * as anchor from "@coral-xyz/anchor";
import TTL from "@isaacs/ttlcache";
import type { OracleJob } from "@switchboard-xyz/common";

export class TaskRunnerCache implements ITaskRunnerCache {
  logger: ITaskRunnerLogger;
  private socketCache: TTL<string, Websocket>;
  private httpResponseCache: TTL<string, string>;
  private anchorIdlCache: TTL<string, anchor.Idl>;

  constructor(
    logger: ITaskRunnerLogger = console,
    socketCacheSize = 1000,
    httpResponseCacheSize = 1000,
    anchorIdlCacheSize = 100
  ) {
    this.logger = logger;
    this.socketCache = new TTL({
      max: socketCacheSize,
      updateAgeOnGet: false,
      ttl: 24 * 60 * 60 * 1000, // at most 24h websocket cache
      dispose: function (websocket: Websocket) {
        websocket.dispose();
      },
    });
    this.httpResponseCache = new TTL({ max: httpResponseCacheSize, ttl: 5000 });
    this.anchorIdlCache = new TTL({
      max: anchorIdlCacheSize,
      ttl: 12 * 60 * 1000,
    }); // could size of IDL impact oracle?
  }

  getOrCreateSocket(wsTask: OracleJob.IWebsocketTask, ttl?: number): Websocket {
    let ws: Websocket;
    if (this.hasSocket(wsTask)) {
      ws = this.getSocket(wsTask)!;
    } else {
      ws = new Websocket(wsTask, this.logger);
      // up to 15min of jitter
      const jitter = Math.floor(Math.random() * (15 * 60 * 1000));
      this.setSocket(wsTask, ws, {
        ttl: ttl ? ttl + jitter : 12 * 60 * 60 * 1000 - jitter,
      });
      // if (ttl) {
      //   setTimeout(() => {
      //     this.delSocket(wsTask);
      //   }, ttl).unref(); // dont hold up exiting node.js for this callback
      // }
    }

    ws.register(wsTask);
    return ws;
  }
  // socket cache
  getSocket(wsTask: OracleJob.IWebsocketTask): Websocket | undefined {
    return this.socketCache.get(wsTask.url ?? "");
  }
  hasSocket(wsTask: OracleJob.IWebsocketTask): boolean {
    return this.socketCache.has(wsTask.url!);
  }
  setSocket(
    wsTask: OracleJob.IWebsocketTask,
    websocket: Websocket,
    options?: ICacheSetOptions
  ): void {
    this.socketCache.set(wsTask.url!, websocket, options);
  }
  delSocket(wsTask: OracleJob.IWebsocketTask): void {
    if (!this.hasSocket(wsTask)) {
      return;
    }
    this.socketCache.delete(wsTask.url!);
  }

  private httpResponseKey(httpTask: OracleJob.IHttpTask): string {
    return JSON.stringify(httpTask);
  }

  getHttpResponse(httpTask: OracleJob.IHttpTask): string | undefined {
    return this.httpResponseCache.get(this.httpResponseKey(httpTask));
  }
  hasHttpResponse(httpTask: OracleJob.IHttpTask): boolean {
    return this.httpResponseCache.has(this.httpResponseKey(httpTask));
  }
  setHttpResponse(
    httpTask: OracleJob.IHttpTask,
    response: string,
    options: ICacheSetOptions
  ): void {
    this.httpResponseCache.set(
      this.httpResponseKey(httpTask),
      response,
      options
    );
  }
  delHttpResponse(httpTask: OracleJob.IHttpTask): void {
    if (this.hasHttpResponse(httpTask)) {
      this.httpResponseCache.delete(this.httpResponseKey(httpTask));
    }
  }

  // Anchor IDLs
  getAnchorIdl(programId: string): anchor.Idl | undefined {
    return this.anchorIdlCache.get(programId);
  }
  hasAnchorIdl(programId: string): boolean {
    return this.anchorIdlCache.has(programId);
  }
  setAnchorIdl(
    programId: string,
    idl: anchor.Idl,
    options: ICacheSetOptions = {
      ttl: 12 * 60 * 60 * 1000,
    }
  ): void {
    this.anchorIdlCache.set(programId, idl, options);
  }
  delAnchorIdl(programId: string): void {
    if (this.hasAnchorIdl(programId)) {
      this.anchorIdlCache.delete(programId);
    }
  }
}
