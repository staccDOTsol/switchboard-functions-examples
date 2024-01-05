import { waitForEvent } from "../../utils/async.js";

import EventEmitter from "events";

export type NodeEventListener = (
  eventName: string,
  timestamp: number
) => void | Promise<void>;

export type NodeStalledListener = (reason?: string) => void | Promise<void>;

export type NodeReadyListener = () => void | Promise<void>;

export interface INodeEvents {
  ready: NodeReadyListener;
  onReady: (readyListener: NodeReadyListener) => void;

  newEvent: NodeEventListener;
  onNewEvent: (nodeEventListener: NodeEventListener) => void;

  newResponse: NodeEventListener;
  onNewResponse: (nodeEventListener: NodeEventListener) => void;

  stalled: NodeStalledListener;
  onStalled: (stalledListener: NodeStalledListener) => void;

  killed: NodeStalledListener;
  onKilled: (stalledListener: NodeStalledListener) => void;

  waitForNodeKilled: () => Promise<void>;
}

export class NodeEvents extends EventEmitter implements INodeEvents {
  private static instance: NodeEvents;
  public static getInstance(): NodeEvents {
    if (!NodeEvents.instance) {
      NodeEvents.instance = new NodeEvents();
    }

    return NodeEvents.instance;
  }

  constructor() {
    super();
  }

  public static NodeReady = "NodeReady";
  public static NodeEvent = "NodeEvent";
  public static NodeResponse = "NodeResponse";
  public static NodeStalled = "NodeStalled";
  public static NodeKilled = "NodeKilled";

  public ready() {
    this.emit(NodeEvents.NodeReady);
  }
  public onReady(readyListener: NodeReadyListener) {
    this.addListener(NodeEvents.NodeReady, readyListener);
  }

  public newEvent(eventName: string) {
    this.emit(NodeEvents.NodeEvent, eventName, Date.now());
  }
  public onNewEvent(nodeEventListener: NodeEventListener) {
    this.addListener(NodeEvents.NodeEvent, nodeEventListener);
  }

  public newResponse(eventName: string) {
    this.emit(NodeEvents.NodeResponse, eventName, Date.now());
  }
  public onNewResponse(nodeEventListener: NodeEventListener) {
    this.addListener(NodeEvents.NodeResponse, nodeEventListener);
  }

  public stalled(reason?: string) {
    this.emit(NodeEvents.NodeStalled, reason);
  }
  public onStalled(stalledListener: NodeStalledListener) {
    this.addListener(NodeEvents.NodeStalled, stalledListener);
  }

  public killed(reason?: string) {
    this.emit(NodeEvents.NodeKilled, reason);
  }
  public onKilled(stalledListener: NodeStalledListener) {
    this.addListener(NodeEvents.NodeKilled, stalledListener);
  }
  async waitForNodeKilled(): Promise<void> {
    await waitForEvent(NodeEvents.NodeKilled);
  }
}
