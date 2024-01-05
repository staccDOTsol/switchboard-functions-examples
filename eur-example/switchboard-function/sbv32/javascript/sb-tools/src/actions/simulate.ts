import type { CliOptions } from "../options";

import { TaskSimulator } from "@switchboard-xyz/task-runner/simulator";
import fs from "fs";

type SimulateOptions = CliOptions & {
  all: boolean;
};

export async function simulate(
  simulationTarget: string,
  options: SimulateOptions
) {
  process.env.VERBOSE = "1";
  const simulator = await TaskSimulator.load(options.cluster, {
    mainnetRpc: options.mainnetUrl,
    rpcUrl: options.rpcUrl,
    jupiterApiKey: "3a3b41bc06d49f9c89a8550ff84072be",
  });

  const lstat = fs.lstatSync(simulationTarget);
  if (lstat.isDirectory()) {
    await simulator.simulateJobJsonDirectory(simulationTarget);
  } else if (lstat.isFile()) {
    const receipt = await simulator.simulateJobJson(simulationTarget ?? "");
    if (options.all as boolean) {
      console.log(JSON.stringify(receipt, undefined, 2));
    }
  }
  process.exit();
}
