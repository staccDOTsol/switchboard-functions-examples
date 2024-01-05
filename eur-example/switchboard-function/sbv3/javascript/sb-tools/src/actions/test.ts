import type { CliOptions } from "../options";

import { TaskSimulator } from "@switchboard-xyz/task-runner/simulator";

type SimulateOptions = CliOptions & {
  all: boolean;
};

export async function testAggregator(
  aggregatorKey: string,
  options: SimulateOptions
) {
  process.env.VERBOSE = "1";

  const simulator = await TaskSimulator.load(options.cluster, {
    mainnetRpc: options.mainnetUrl,
    rpcUrl: options.rpcUrl,
    jupiterApiKey: "3a3b41bc06d49f9c89a8550ff84072be",
  });

  await simulator.simulateAggregatorKey(aggregatorKey);

  process.exit();
}

export async function testJob(jobKey: string, options: SimulateOptions) {
  process.env.VERBOSE = "1";

  const simulator = await TaskSimulator.load(options.cluster, {
    mainnetRpc: options.mainnetUrl,
    rpcUrl: options.rpcUrl,
    jupiterApiKey: "3a3b41bc06d49f9c89a8550ff84072be",
  });

  await simulator.simulateJobKey(jobKey);

  process.exit();
}
