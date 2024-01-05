import { sleep } from "../src/utils/index.js";

describe("sleep tests", () => {
  async function advanceTime(ms: number) {
    jest.advanceTimersByTime(ms);
    return Promise.resolve(); // Let PromiseJobs queue run.
  }

  beforeEach(() => jest.useFakeTimers());

  it("sleeping 1000ms waits for entire 1000ms", async () => {
    let resolved = false;
    sleep(1000).then(() => (resolved = true));

    await advanceTime(990);
    expect(resolved).toBe(false);

    await advanceTime(10);
    expect(resolved).toBe(true);
  });
});
