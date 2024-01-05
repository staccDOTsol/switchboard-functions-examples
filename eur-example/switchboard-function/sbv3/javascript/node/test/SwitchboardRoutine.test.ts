import "jest";

import { SwitchboardRoutine } from "../src/SwitchboardRoutine.js";

import { expect, jest } from "@jest/globals";
import { sleep } from "@switchboard-xyz/common";

const DEFAULT_ROUTINE_INTERVAL = 100;

class MockSwitchboardRoutine extends SwitchboardRoutine {
  public eventName = "MockRoutine";
  retryInterval?: number = undefined;
  errorHandler = undefined;
  // errorHandler?: (error?: any, ...args: any[]) => Promise<void> = async (
  //   error?: any
  // ) => {
  //   NodeLogger.getInstance().error((error as any).toString());
  // };
  successHandler?: (error?: any, ...args: any[]) => Promise<void> = undefined;

  routine = async () => {
    return Promise.resolve();
  };

  // routine: any = jest
  //   .fn<() => Promise<void>>()
  //   .mockImplementation(() => Promise.resolve());

  constructor(routineInterval: number) {
    super(routineInterval);
  }
}

describe("SwitchboardRoutine", () => {
  let mockSwitchboardRoutine: MockSwitchboardRoutine;

  beforeAll(async () => {
    jest.clearAllMocks();
    mockSwitchboardRoutine = new MockSwitchboardRoutine(
      DEFAULT_ROUTINE_INTERVAL
    );
    jest
      .spyOn(mockSwitchboardRoutine, "routine")
      .mockImplementation(() => Promise.resolve());
  });

  afterAll(async () => {
    if (mockSwitchboardRoutine && mockSwitchboardRoutine.isActive) {
      mockSwitchboardRoutine.stop();
    }
  });

  describe("constructor", () => {
    jest.restoreAllMocks();

    beforeAll(async () => {
      jest.clearAllMocks();
      mockSwitchboardRoutine = new MockSwitchboardRoutine(
        DEFAULT_ROUTINE_INTERVAL
      );
    });

    it("should set the routineInterval property", () => {
      expect(mockSwitchboardRoutine.routineInterval).toBe(
        DEFAULT_ROUTINE_INTERVAL
      );
    });

    it("should set the isActive property to false", () => {
      expect(mockSwitchboardRoutine.isActive).toBe(false);
    });

    it("should not set the timer property", () => {
      expect(mockSwitchboardRoutine.timer).toBeUndefined();
    });
  });

  describe("start", () => {
    jest.restoreAllMocks();

    beforeAll(async () => {
      jest.clearAllMocks();
      await mockSwitchboardRoutine.start();
    });

    it("should set the isActive property to true", async () => {
      expect(mockSwitchboardRoutine.isActive).toBe(true);
    });

    it("should set a timer for the routine", async () => {
      expect(mockSwitchboardRoutine.timer).toBeDefined();
    });
  });

  describe("run", () => {
    jest.restoreAllMocks();

    jest.setTimeout(15000);

    beforeEach(async () => {
      jest.clearAllMocks();
      mockSwitchboardRoutine = new MockSwitchboardRoutine(
        DEFAULT_ROUTINE_INTERVAL
      );
    });

    afterEach(async () => {
      if (mockSwitchboardRoutine && mockSwitchboardRoutine.isActive) {
        mockSwitchboardRoutine.stop();
      }
    });

    it("should schedule the next callback on success", async () => {
      const routineSpy = jest.spyOn(mockSwitchboardRoutine, "routine");
      const errorHandlerSpy = jest.spyOn(
        mockSwitchboardRoutine,
        "defaultErrorHandler"
      );
      const defaultErrorHandlerSpy = jest.spyOn(
        mockSwitchboardRoutine,
        "defaultErrorHandler"
      );

      expect(routineSpy).toBeCalledTimes(0);
      expect(mockSwitchboardRoutine.counter).toEqual(0);

      await mockSwitchboardRoutine.start();
      expect(routineSpy).toBeCalledTimes(1);
      expect(mockSwitchboardRoutine.counter).toEqual(1);

      await sleep(1.1 * DEFAULT_ROUTINE_INTERVAL);
      expect(routineSpy).toBeCalledTimes(2);
      expect(mockSwitchboardRoutine.counter).toEqual(2);

      await sleep(1.1 * DEFAULT_ROUTINE_INTERVAL);
      expect(routineSpy).toBeCalledTimes(3);
      expect(mockSwitchboardRoutine.counter).toEqual(3);

      expect(defaultErrorHandlerSpy).toBeCalledTimes(0);
      expect(errorHandlerSpy).toBeCalledTimes(0);
    });

    it("should schedule the next callback on error with no retryInterval set", async () => {
      const routineSpy = jest.spyOn(mockSwitchboardRoutine, "routine");
      const errorHandlerSpy = jest.spyOn(
        mockSwitchboardRoutine,
        "defaultErrorHandler"
      );

      expect(routineSpy).toBeCalledTimes(0);
      expect(mockSwitchboardRoutine.counter).toEqual(0);

      await mockSwitchboardRoutine.start();
      expect(routineSpy).toBeCalledTimes(1);
      expect(mockSwitchboardRoutine.counter).toEqual(1);

      routineSpy.mockRejectedValueOnce("routine failed");

      await sleep(1.1 * DEFAULT_ROUTINE_INTERVAL);
      expect(routineSpy).toBeCalledTimes(2);
      expect(mockSwitchboardRoutine.counter).toEqual(2);
      expect(errorHandlerSpy).toBeCalledTimes(1);

      await sleep(1.1 * DEFAULT_ROUTINE_INTERVAL);
      expect(routineSpy).toBeCalledTimes(3);
      expect(mockSwitchboardRoutine.counter).toEqual(3);
    });

    it("should schedule the next callback on error with a retryInterval set", async () => {
      mockSwitchboardRoutine.retryInterval = 3 * DEFAULT_ROUTINE_INTERVAL;

      const routineSpy = jest.spyOn(mockSwitchboardRoutine, "routine");
      const errorHandlerSpy = jest.spyOn(
        mockSwitchboardRoutine,
        "defaultErrorHandler"
      );

      // Counter = 0
      expect(routineSpy).toBeCalledTimes(0);
      expect(mockSwitchboardRoutine.counter).toEqual(0);

      // Counter = 1
      await mockSwitchboardRoutine.start();
      expect(routineSpy).toBeCalledTimes(1);
      expect(mockSwitchboardRoutine.counter).toEqual(1);

      routineSpy.mockRejectedValueOnce("routine failed");

      // Counter = 2
      await sleep(1.05 * DEFAULT_ROUTINE_INTERVAL);
      expect(routineSpy).toBeCalledTimes(2);
      expect(mockSwitchboardRoutine.counter).toEqual(2);
      await sleep(1.05 * DEFAULT_ROUTINE_INTERVAL);
      expect(routineSpy).toBeCalledTimes(2);
      expect(mockSwitchboardRoutine.counter).toEqual(2);
      await sleep(1.05 * DEFAULT_ROUTINE_INTERVAL);
      expect(routineSpy).toBeCalledTimes(2);
      expect(mockSwitchboardRoutine.counter).toEqual(2);

      // Counter = 3
      await sleep(1.05 * DEFAULT_ROUTINE_INTERVAL);
      expect(routineSpy).toBeCalledTimes(3);
      expect(mockSwitchboardRoutine.counter).toEqual(3);
      expect(errorHandlerSpy).toBeCalledTimes(1);

      // Counter = 4
      // resolves and uses routineInterval
      await sleep(1.05 * DEFAULT_ROUTINE_INTERVAL);
      expect(routineSpy).toBeCalledTimes(4);
      expect(mockSwitchboardRoutine.counter).toEqual(4);
      expect(errorHandlerSpy).toBeCalledTimes(1);
    });

    it("should call the defaultErrorHandler if the routine throws an error", async () => {
      mockSwitchboardRoutine.errorHandler = undefined;
      const routineSpy = jest.spyOn(mockSwitchboardRoutine, "routine");

      const errorSpy = jest.spyOn(
        mockSwitchboardRoutine,
        "defaultErrorHandler"
      );

      // Counter = 0
      expect(mockSwitchboardRoutine.counter).toEqual(0);

      // Counter = 1
      await mockSwitchboardRoutine.start();
      expect(mockSwitchboardRoutine.counter).toEqual(1);

      routineSpy.mockImplementationOnce(() => Promise.reject("routine failed"));

      await sleep(1.1 * DEFAULT_ROUTINE_INTERVAL);
      expect(errorSpy).toBeCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith("routine failed");
    });
  });

  describe("stop", () => {
    it("should set the isActive property to false", async () => {
      await mockSwitchboardRoutine.stop();
      expect(mockSwitchboardRoutine.isActive).toBe(false);
    });
  });
});
