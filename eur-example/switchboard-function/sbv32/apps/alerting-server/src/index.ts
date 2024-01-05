import { AlertingServer } from "./app.js";
import { NodeHealthCheck } from "./health.js";

import { PagerDuty } from "@switchboard-xyz/node/alerts/pager-duty";
import dotenv from "dotenv";
dotenv.config();

(async function main() {
  try {
    // start http server but dont serve requests yet
    NodeHealthCheck.getInstance();

    const app = await AlertingServer.load();

    await app.start();
  } catch (e: any) {
    console.error(e);
    await PagerDuty.getInstance().sendEvent(
      "critical",
      "SwitchboardCriticalError: node shutting down.",
      {
        error: e.stack.toString(),
      }
    );

    process.exit(1);
  }
})();
