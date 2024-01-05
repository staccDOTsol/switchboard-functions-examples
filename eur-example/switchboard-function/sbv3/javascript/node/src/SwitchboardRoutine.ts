import { NodeEvents } from "./modules/events/index.js";
import { NodeLogger } from "./modules/logging/index.js";
import { SwitchboardEventDispatcher } from "./SwitchboardEventDispatcher.js";

/**
 * Handle routine functions like heartbeat, periodically checking unwrap stake threshold, or crank pop.
 *
 * WARNING: You need to explicitly start the routine before it runs. Any routines added to
 * the {@link Oracle} class will be started automatically.
 */
export abstract class SwitchboardRoutine extends SwitchboardEventDispatcher {
  /** The number of milliseconds to wait before retrying the routine. If not provided then it will not be retried until it's next scheduled run. */
  abstract retryInterval?: number;
  // node timer
  timer: NodeJS.Timeout | undefined;
  // whether the routine is active
  isActive: boolean = false;
  // how to handle routine failures
  abstract errorHandler?: (error?: any, ...args: any[]) => Promise<void>;
  // function to be called when routine finishes successfully
  abstract successHandler?: (error?: any, ...args: any[]) => Promise<void>;
  // the routine to run
  abstract routine: (...args: any[]) => Promise<void>;

  defaultErrorHandler(error?: any, ...args: any[]): void {
    NodeLogger.getInstance().error(`SwitchboardRoutineError: ${error}`);
  }

  /**
   * @param routineInterval - the number of milliseconds to wait between routines
   */
  constructor(readonly routineInterval: number) {
    super();
  }

  async start(): Promise<void> {
    NodeLogger.getInstance().info(
      `${this.eventName} routine started with an interval of ${(
        this.routineInterval / 1000
      ).toFixed(3)} seconds.`
    );

    NodeEvents.getInstance().onStalled(async (reason) => {
      await this.stop();
    });

    this.isActive = true;
    this.callback();

    return;
  }

  async stop(): Promise<void> {
    this.isActive = false;
    this.removeTimer();
  }

  // shadow SwitchboardEventDispatcher impl so we dont increment counter here
  // increment on every callback iteration
  /** Emit a 'NodeEvent' to signal the node is receiving valid events */
  public newEvent(): void {
    NodeEvents.getInstance().newEvent(this.eventName);
  }

  removeTimer() {
    if (this.timer !== undefined) {
      try {
        clearTimeout(this.timer);
        this.timer = undefined;
      } catch {}
    }
  }

  setTimer(delay = this.routineInterval) {
    this.removeTimer();
    if (this.isActive) {
      this.timer = setTimeout(() => {
        if (this.isActive) {
          this.callback();
        }
      }, delay).unref(); // dont block shutdown with timer
    } else {
      this.timer = undefined;
    }
  }

  /** This should never throw an error */
  callback = async () => {
    this.incrementCounter();

    this.routine()
      .then(() => {
        this.setTimer();

        if (this.successHandler !== undefined) {
          this.successHandler().catch(this.defaultErrorHandler).catch();
        }
      })
      .catch((error) => {
        if (this.retryInterval !== undefined && this.retryInterval >= 0) {
          this.setTimer(this.retryInterval);
        } else {
          this.setTimer();
        }

        if (this.errorHandler !== undefined) {
          this.errorHandler(error).catch(() => {
            this.defaultErrorHandler(error);
          });
        } else {
          this.defaultErrorHandler(error);
        }
      });
  };
}
