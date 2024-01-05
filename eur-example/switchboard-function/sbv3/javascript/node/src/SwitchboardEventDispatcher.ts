import { NodeEvents } from "./modules/events/index.js";
import { NodeLogger } from "./modules/logging/index.js";

export interface EventLifecycle {
  eventName: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  callback(...args: any): Promise<void>;
}

/** Dispatch switchboard events, either periodically or in response to an event */
export abstract class SwitchboardEventDispatcher implements EventLifecycle {
  // keep track of how many times a new and valid event has been received
  public counter = 0;

  abstract eventName: string;

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract callback(...args: any): Promise<void>;

  public incrementCounter(): void {
    this.counter = (this.counter % Number.MAX_SAFE_INTEGER) + 1;
  }

  /** Emit a 'NodeEvent' to signal the node is receiving valid events */
  public newEvent(): void {
    this.incrementCounter(); // we could add the counter to new event
    NodeEvents.getInstance().newEvent(this.eventName);
  }

  /** Emit a 'NodeResponse' to signal the node is responding to events */
  public newResponse(): void {
    NodeEvents.getInstance().newResponse(this.eventName);
  }

  public async restart(): Promise<void> {
    NodeLogger.getInstance().debug(
      `Restarting event ${this.eventName}`,
      "EventLoop"
    );
    await this.stop();
    await this.start().catch(async (error1) => {
      NodeLogger.getInstance().error(
        `${this.eventName} failed to restart, trying one more time: ${error1}`,
        "EventLoop"
      );
      // try one more time to start event
      await this.start().catch((error) => {
        const message = `${this.eventName} failed to restart, ${error}`;
        NodeLogger.getInstance().error(message, "EventLoop");
        NodeEvents.getInstance().stalled(message);
      });
    });
  }

  public async run(): Promise<void> {
    try {
      await this.start();
    } catch (error) {
      this.catch(error);
    }
  }

  public async end(): Promise<void> {
    try {
      await this.stop();
    } catch (error) {
      this.catch(error);
    }
  }

  public async catch(error: any): Promise<void> {
    throw error;
  }
}
