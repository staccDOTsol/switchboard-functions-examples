/**
 * This example shows how to listen to all events on Sui
 */
import { RPC, SWITCHBOARD_ADDRESS, WSS } from "./common";

import type { Ed25519Keypair } from "@mysten/sui.js";
import { Connection, JsonRpcProvider } from "@mysten/sui.js";
import type { EventCallback } from "@switchboard-xyz/sui.js";
import { SuiEvent } from "@switchboard-xyz/sui.js";

async function allUpdatesListener(
  provider: JsonRpcProvider,
  callback: EventCallback
): Promise<SuiEvent> {
  const event = new SuiEvent(provider);
  await event.onTrigger(callback, (e) => {
    console.error(e);
  });
  return event;
}

// run it all at once
(async () => {
  try {
    const connection = new Connection({
      websocket: WSS,
      fullnode: RPC,
    });
    // connect to Devnet
    const provider = new JsonRpcProvider(connection);
    const keypair: Ed25519Keypair | null = null;

    await allUpdatesListener(provider, async (e) => {
      console.log(e);
    });
  } catch (e) {
    console.error(e);
  }
})();
