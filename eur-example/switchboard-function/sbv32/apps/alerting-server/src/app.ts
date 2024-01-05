import { ReadStoreRoutine } from "./routines/ReadStoreRoutine";

import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { SwitchboardApp } from "@switchboard-xyz/node";

export class AlertingServer extends SwitchboardApp {
  chain = "all";
  app = "alerting";

  constructor(readonly routines: SwitchboardEventDispatcher[]) {
    super();
  }

  public static async load(): Promise<AlertingServer> {
    const routines: Array<SwitchboardEventDispatcher> = [
      new ReadStoreRoutine(30), // update alerts every 30 seconds
    ];

    const app = new AlertingServer(routines);

    return app;
  }
}
