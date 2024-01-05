import { NodeEvents } from "@switchboard-xyz/node/events";
import EventEmitter from "events";
import { waitFor } from "wait-for-event";

export function waitForever(): Promise<void> {
  return waitFor("", new EventEmitter());
}

export function waitForEvent(eventName = "NodeKilled"): Promise<void> {
  return waitFor(eventName, NodeEvents.getInstance());
}
