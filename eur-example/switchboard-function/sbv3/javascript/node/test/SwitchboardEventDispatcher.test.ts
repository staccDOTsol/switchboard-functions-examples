import "jest";

import { NodeEvents } from "../src/modules/events/index.js";
import { NodeLogger } from "../src/modules/logging/NodeLogger.js";
import { SwitchboardEventDispatcher } from "../src/SwitchboardEventDispatcher.js";

import { expect, jest } from "@jest/globals";

class MockSwitchboardEventDispatcher extends SwitchboardEventDispatcher {
  public eventName = "MockTestEvent";
  retryInterval = 0;
  errorHandler = async (error?: any) => {
    NodeLogger.getInstance().error((error as any).toString());
  };
  callback = async (...args: any[]) => {
    this.newEvent();
    this.newResponse();
    return Promise.resolve();
  };

  constructor() {
    super();
  }

  public start(): Promise<void> {
    NodeEvents.getInstance().removeAllListeners(this.eventName);
    NodeEvents.getInstance().addListener(this.eventName, () => {
      this.callback();
    });
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    NodeEvents.getInstance().removeAllListeners(this.eventName);
    return Promise.resolve();
  }

  public emitNewEvent() {
    NodeEvents.getInstance().emit(this.eventName);
  }
}

describe("Event Dispatcher Tests", () => {
  const switchboardEventDispatcher = new MockSwitchboardEventDispatcher();

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("start", () => {
    it("should call the start function when event is initialized", () => {
      const startMock = jest.spyOn(switchboardEventDispatcher, "start");
      switchboardEventDispatcher.run();
      expect(startMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("run", () => {
    it("should increment counter on new event", () => {
      switchboardEventDispatcher.newEvent();
      expect(switchboardEventDispatcher.counter).toEqual(1);
    });

    it("should invoke the callback when a new event is emitted", async () => {
      jest.spyOn(switchboardEventDispatcher, "callback");

      switchboardEventDispatcher.emitNewEvent();
      expect(switchboardEventDispatcher.callback).toHaveBeenCalledTimes(1);
      expect(switchboardEventDispatcher.counter).toEqual(2);

      switchboardEventDispatcher.emitNewEvent();
      expect(switchboardEventDispatcher.callback).toHaveBeenCalledTimes(2);
      expect(switchboardEventDispatcher.counter).toEqual(3);
    });
  });

  describe("restart", () => {
    it("should restart successfully", async () => {
      const startMock = jest.spyOn(switchboardEventDispatcher, "start");
      const stopMock = jest.spyOn(switchboardEventDispatcher, "stop");
      await switchboardEventDispatcher.restart();
      expect(startMock).toHaveBeenCalledTimes(1);
      expect(stopMock).toHaveBeenCalledTimes(1);
    });

    it("should log an error if failed to restart twice", async () => {
      const startMock = jest
        .spyOn(switchboardEventDispatcher, "start")
        .mockRejectedValue(new Error("Start error"));
      const stopMock = jest.spyOn(switchboardEventDispatcher, "stop");
      const stalledSpy = jest
        .spyOn(NodeEvents.getInstance(), "stalled")
        .mockImplementation(() => {});

      await switchboardEventDispatcher.restart();

      expect(startMock).toHaveBeenCalledTimes(2);
      expect(stopMock).toHaveBeenCalledTimes(1);
      expect(stalledSpy).toHaveBeenCalledTimes(1);

      expect(stalledSpy).toHaveBeenCalledWith(
        `${switchboardEventDispatcher.eventName} failed to restart, Error: Start error`
      );
    });
  });

  describe("stop", () => {
    it("should call the stop function when event is terminated", () => {
      const stopMock = jest.spyOn(switchboardEventDispatcher, "stop");
      switchboardEventDispatcher.end();
      expect(stopMock).toHaveBeenCalledTimes(1);
    });
  });
});
