import { NodeEvents } from "./modules/events/index.js";
import { ConsoleLogger, NodeLogger } from "./modules/logging/index.js";
import { NodePerformance } from "./modules/performance/index.js";
import { extractBooleanEnvVar } from "./utils/env.js";
import type { SwitchboardEventDispatcher } from "./SwitchboardEventDispatcher.js";

import dotenv from "dotenv";
dotenv.config();

export type AppLifecycle = {
  chain: string;
  app: string;
  routines: SwitchboardEventDispatcher[];

  start: (...args: any[]) => void | Promise<void>;
  stop: (...args: any[]) => void | Promise<void>;
  catch: (error?: any) => void | Promise<void>;
};

/** A NodeApp contains a collection of routines to  */
export abstract class SwitchboardApp implements AppLifecycle {
  readonly startTimestamp = Date.now();

  abstract chain: string;
  abstract app: string;
  abstract routines: SwitchboardEventDispatcher[];

  public get name(): string {
    return `${
      this.chain.length
        ? this.chain[0].toUpperCase() + this.chain.slice(1)
        : "Unknown"
    }${
      this.app.length
        ? this.app[0].toUpperCase() + this.app.slice(1)
        : "Unknown"
    }`;
  }

  /** The number of milliseconds an app has been running for */
  public get uptime(): number {
    return Math.round(Date.now() - this.startTimestamp);
  }

  async start(): Promise<void> {
    try {
      if (this.routines.length === 0) {
        throw new Error(`SwitchboardApp has no routines defined`);
      }

      NodeLogger.getInstance().info(`${this.name} starting ...`, this.app);

      // start all routines
      await Promise.all(this.routines.map((e) => e.start()));

      // health check server started
      NodeEvents.getInstance().ready();

      // start event loop monitoring after routines have started
      NodePerformance.getInstance().enable();

      // add NodeStalled/NodeKilled listener
      NodeEvents.getInstance().onStalled(async (reason?: string) => {
        if (process.env.DEBUG) {
          ConsoleLogger.yellow(`NodeStalled: ${reason}`);
        }
        await this.stop(reason);
      });
      NodeEvents.getInstance().onKilled(async (reason?: string) => {
        // TODO: Handle paging here, only page if absolutely critical
        if (process.env.DEBUG) {
          ConsoleLogger.yellow(`NodeKilled: ${reason}`);
        }
      });

      // disable/control logging after initialization
      if (extractBooleanEnvVar("DISABLE_LOGGER")) {
        NodeLogger.getInstance().disable();
      }

      // define unhandled rejections behavior. Options are 'strict' (always raise an error), 'throw' (raise an error
      // unless 'unhandledRejection' hook is set), 'warn' (log a warning), 'none' (silence warnings),
      // 'warn-with-error-code' (log a warning and set exit code 1 unless 'unhandledRejection' hook is set).
      // (default: throw)
      const unhandledRejectionsValue = (
        process.execArgv.find((arg) =>
          arg.startsWith("--unhandled-rejections")
        ) ?? "--unhandled-rejections=warn"
      ).split("=", 2)[1];

      process.on("uncaughtException", (err, exceptionOrigin) => {
        ConsoleLogger.red(`UncaughtException at ${exceptionOrigin}`);
        console.error(err);

        if (unhandledRejectionsValue === "strict" && isFatalError(err)) {
          NodeEvents.getInstance().stalled((err as any).toString());
        } else {
          ConsoleLogger.green(`Node NOT Exiting...`);
        }
      });

      process.on("unhandledRejection", (reason, rejectedPromise) => {
        ConsoleLogger.red(`UncaughtRejection for promise ${reason}`);
        console.error(reason);

        if (unhandledRejectionsValue === "strict" && isFatalError(reason)) {
          NodeEvents.getInstance().stalled((reason as any).toString());
        } else {
          ConsoleLogger.green(`Node NOT Exiting...`);
        }
      });

      // catch some common POSIX signals
      // SIGTERM is used by k8s healthcheck
      ["SIGTERM", "SIGINT", "SIGQUIT"].map((signal) => {
        process.on(signal, () => {
          const message = `${signal} received`;
          ConsoleLogger.red(message);
          NodeEvents.getInstance().stalled(message);
        });
      });

      await NodeEvents.getInstance().waitForNodeKilled();
      process.exit(1); // only exit after this event has been received
    } catch (error) {
      this.catch(error);
    }
  }

  async stop(reason?: string) {
    NodeLogger.getInstance().info(
      `${this.name} stopped, ${reason ?? "Unknown"}`,
      this.app
    );
    await Promise.all(this.routines.map((e) => e.end()));
    NodeLogger.getInstance().info(`${this.name} exiting ...`, this.app);
    NodeEvents.getInstance().killed(reason);
  }

  async catch(error: any): Promise<void> {
    throw error;
  }
}

function isFatalError(error: unknown): boolean {
  const errorString: string = (error as any).toString();
  if (
    errorString.includes("ECONNRESET") ||
    errorString.includes("socket hang up")
  ) {
    return false;
  }

  return true;
}
