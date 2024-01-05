import type { IJobContext } from "../types/JobContext.js";
import { verifyUrl } from "../utils/http.js";

import type { OracleJob } from "@switchboard-xyz/common";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

/**
 * Open a websocket and cache the responses for light speed retrieval.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iWebsocketTask] A WsTask to run.
 * @throws {String}
 * @returns {Promise<string>} The result from the websocket connection (expected to be JSON data).
 */
export async function websocketTask(
  ctx: IJobContext,
  iWebsocketTask: OracleJob.IWebsocketTask
): Promise<string> {
  verifyUrl(iWebsocketTask.url ?? "");

  // gets or creates websocket
  // will also register subscription if it doesnt exist
  const websocket = ctx.cache.getOrCreateSocket(
    iWebsocketTask,
    ctx.isSimulator
      ? 10 * MILLISECONDS_PER_MINUTE // close simulator websockets after 10 minutes
      : 3 * 60 * MILLISECONDS_PER_MINUTE // close websocket after 3 hours
  );

  // see if response is available
  try {
    const response = websocket.response(iWebsocketTask);
    return response.data;
  } catch {}

  // check if socket is healthy
  if (websocket.isStale) {
    ctx.logger.debug(
      `WebsocketStale: ${websocket.readyState}, ${iWebsocketTask.url}`
    );
    ctx.cache.delSocket(iWebsocketTask);
    throw new Error("WebsocketStale");
  }

  // try to resubscribe or briefly wait for a message
  if (!websocket.isConnected) {
    // give it time to initially connect and populate
    ctx.logger.debug(
      `WS IS STILL CONNECTING ${websocket.readyState}, ${iWebsocketTask.url}, ${iWebsocketTask.subscription}`
    );
  }

  // await for next message
  const response = await websocket.onNextResponse(
    iWebsocketTask,
    ctx.isSimulator ? 5000 : 1500
  );

  return response.data;
}
