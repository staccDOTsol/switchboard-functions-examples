import { AlertsProvider } from "../alerts";

import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";

export class ReadStoreRoutine extends SwitchboardRoutine {
  eventName = "ReadStore";

  errorHandler = async (error?: any) => {
    NodeLogger.getInstance().log("Crank turn failed.");
    NodeLogger.getInstance().error((error as any).toString());
  };
  successHandler = undefined;
  retryInterval = undefined;

  constructor(updateIntervalSeconds: number) {
    super(updateIntervalSeconds * 1000); // refresh alerts every 30 seconds
  }

  routine = async () => {
    NodeLogger.getInstance().info("ReadStore routine not implemented yet");

    // we can add alerts like this
    const alerts = AlertsProvider.getInstance().addAlert({
      name: "new-alert",
      chain: "idk",
      threshold: "2",
    });

    return;
  };
}
