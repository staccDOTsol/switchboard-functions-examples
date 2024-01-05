import { NodeEnvironment } from "../env/NodeEnvironment";

import type { ChainType } from "@switchboard-xyz/common";
import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { extractBooleanEnvVar } from "@switchboard-xyz/node";
import { NodeEvents } from "@switchboard-xyz/node/events";
import { ConsoleLogger, NodeLogger } from "@switchboard-xyz/node/logging";
import { NodePerformance } from "@switchboard-xyz/node/performance";

export type App = "oracle" | "crank" | "monitor";

export type NodeLifecycle = {
  chain: ChainType;
  app: App;
  routines: SwitchboardEventDispatcher[];

  start: (...args: any[]) => void | Promise<void>;
  stop: (...args: any[]) => void | Promise<void>;
  catch: (error?: any) => void | Promise<void>;
};

/** A NodeApp contains a collection of routines to  */
export abstract class SwitchboardApp implements NodeLifecycle {
  readonly startTimestamp = Date.now();

  abstract chain: ChainType;
  abstract app: App;
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
        if (NodeEnvironment.getInstance().DEBUG) {
          ConsoleLogger.yellow(`NodeStalled: ${reason}`);
        }
        await this.stop(reason);
      });
      NodeEvents.getInstance().onKilled(async (reason?: string) => {
        // TODO: Handle paging here, only page if absolutely critical
        if (NodeEnvironment.getInstance().DEBUG) {
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
