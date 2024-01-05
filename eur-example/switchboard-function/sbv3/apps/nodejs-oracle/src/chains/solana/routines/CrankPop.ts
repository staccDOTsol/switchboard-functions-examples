import { SolanaEnvironment } from "../../../env/SolanaEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import type { SolanaCrankProvider } from "../crank/CrankProvider";
import { DEFAULT_COMMITMENT } from "../types";

import { BN, promiseWithTimeout } from "@switchboard-xyz/common";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { extractBooleanEnvVar } from "@switchboard-xyz/node";
import { PagerDuty } from "@switchboard-xyz/node/alerts/pager-duty";
import { ConsoleLogger, NodeLogger } from "@switchboard-xyz/node/logging";
import type { types } from "@switchboard-xyz/solana.js";

const CRANK_STALENESS_THRESHOLD =
  process.env.CRANK_STALENESS_THRESHOLD &&
  +process.env.CRANK_STALENESS_THRESHOLD &&
  +process.env.CRANK_STALENESS_THRESHOLD > 0
    ? Number.parseInt(process.env.CRANK_STALENESS_THRESHOLD)
    : undefined;

const MAXIMUM_NUMBER_OF_READY_ROWS =
  process.env.NUMBER_OF_CRANK_ROWS && +process.env.NUMBER_OF_CRANK_ROWS > 0
    ? +process.env.NUMBER_OF_CRANK_ROWS
    : 15;

// CRANK_INTERVAL of 0 will lead to socket hang ups
const CRANK_INTERVAL =
  process.env.CRANK_INTERVAL && +process.env.CRANK_INTERVAL > 0
    ? Number.parseInt(process.env.CRANK_INTERVAL)
    : 500;

// this shouldnt be used ever, useful for debugging
const CRANK_LEAD_SECONDS =
  process.env.CRANK_LEAD_SECONDS && +process.env.CRANK_LEAD_SECONDS > 0
    ? Number.parseInt(process.env.CRANK_LEAD_SECONDS)
    : 0;

const SOLANA_CRANK_POP_COMMITMENT =
  process.env.SOLANA_CRANK_POP_COMMITMENT &&
  process.env.SOLANA_CRANK_POP_COMMITMENT === "processed"
    ? "processed"
    : DEFAULT_COMMITMENT;

const CRANK_LOAD_TIMEOUT =
  process.env.CRANK_LOAD_TIMEOUT && +process.env.CRANK_LOAD_TIMEOUT > 500
    ? Number.parseInt(process.env.CRANK_LOAD_TIMEOUT)
    : 5000;

export class CrankPopRoutine extends SwitchboardRoutine {
  eventName = "SolanaCrank";

  errorHandler = async (error?: any) => {
    NodeLogger.getInstance().log("Crank turn failed.");
    NodeLogger.getInstance().error((error as any).toString());
  };
  successHandler = undefined;
  retryInterval = undefined;

  lastAlert = Date.now(); // gives crank time to catch-up during initialization

  _nextTimestamp: number;
  _crankRows: Array<types.CrankRow>;

  constructor(
    readonly provider: SolanaCrankProvider,
    initialCrankRows: Array<types.CrankRow>
  ) {
    super(CRANK_INTERVAL);
    this._crankRows = [...initialCrankRows];
    this._nextTimestamp = this._crankRows[0]?.nextTimestamp.toNumber() ?? 0;
  }

  async getCrankRows(): Promise<Array<types.CrankRow>> {
    try {
      // wrap in a timeout, socket hang up can cause this to block event loop
      const crankRows = await promiseWithTimeout(
        CRANK_LOAD_TIMEOUT,
        this.provider.fetchCrankRows(
          SOLANA_CRANK_POP_COMMITMENT,
          extractBooleanEnvVar("SOLANA_CRANK_LOAD_CONNECTION") // force using the connection instead of the rest endpoint
        ),
        `Failed to fetch crank rows in ${CRANK_LOAD_TIMEOUT} ms`
      );
      if (crankRows.length > 0) {
        this._crankRows = crankRows;
      }
    } catch (error) {
      NodeLogger.getInstance().error(
        `Failed to load the crank: ${error}`,
        this.eventName
      );
    }
    return this._crankRows;
  }

  _name: string | undefined = undefined;
  get name(): string {
    if (this._name) {
      return this._name;
    }
    this._name = "";
    const crankKey = this.provider.crankAccount.publicKey.toBase58();
    if (crankKey === "GdNVLWzcE6h9SPuSbmu69YzxAj8enim9t6mjzuqTXgLd") {
      this._name = "Mainnet-Permissioned-Crank";
    } else if (crankKey === "BKtF8yyQsj3Ft6jb2nkfpEKzARZVdGgdEPs6mFmZNmbA") {
      this._name = "Mainnet-Permissionless-Crank";
    } else if (crankKey === "85L2cFUvXaeGQ4HrzP8RJEVCL7WvRrXM2msvEmQ82AVr") {
      this._name = "Devnet-Permissioned-Crank";
    } else if (crankKey === "GN9jjCy2THzZxhYqZETmPM3my8vg4R5JyNkgULddUMa5") {
      this._name = "Devnet-Permissionless-Crank";
    }
    return this._name;
  }

  /** Send a PagerDuty alert if crank threshold is exceeded */
  checkStaleness(): number {
    const now = Date.now();

    const topOfCrank = this._crankRows[0].nextTimestamp.toNumber();
    const crankStaleness = this.provider.solanaTime.toNumber() - topOfCrank;
    const alertStaleness = now - this.lastAlert;

    NodeMetrics.getInstance()?.recordFeedUpdateTimeDelay(crankStaleness);

    if (
      this._crankRows.length &&
      CRANK_STALENESS_THRESHOLD &&
      alertStaleness > 10000 // only page every 10sec if crank is behind
    ) {
      if (crankStaleness > CRANK_STALENESS_THRESHOLD) {
        const crankPubkey = this.provider.crankAccount.publicKey.toBase58();
        // critical - Minimum of 15min staleness and 10x threshold
        // warning - Minimum of 5min staleness and 5x threshold
        // info - if greater than threshold
        const severity =
          crankStaleness > Math.min(900, 10 * CRANK_STALENESS_THRESHOLD)
            ? "critical"
            : crankStaleness > Math.min(300, 5 * CRANK_STALENESS_THRESHOLD)
            ? "warning"
            : "info";
        this.lastAlert = now;
        const message = `${severity.toUpperCase()}: ${
          this.name ?? "Crank"
        } is ${crankStaleness} seconds behind`;
        NodeLogger.getInstance().debug(message, this.eventName);
        PagerDuty.getInstance()
          .sendEvent(severity, message, {
            crankPubkey: crankPubkey,
            crank: this.name ?? undefined,
          })
          .catch();
      }
    }

    return crankStaleness;
  }

  /** Check the time differences between when a crank is scheduled to pop and when a CrankPop is sent */
  checkFeedUpdateTimeDelays(
    signatures: string[],
    poppedRows: Array<types.CrankRow>
  ): number[] {
    const feedUpdateTimeDelays: Array<number> = [];

    signatures.map((signature, i) => {
      this.provider.connection
        .getTransaction(signature)
        .then((txn) => {
          if (txn && txn?.blockTime) {
            const delay =
              txn.blockTime - poppedRows[i].nextTimestamp.toNumber();
            console.log(
              `feedUpdateTimeDelay for ${poppedRows[
                i
              ].pubkey.toBase58()}: ${delay}`
            );
            feedUpdateTimeDelays.push(delay);
            NodeMetrics.getInstance()?.recordFeedUpdateTimeDelay(delay);
          } else {
            console.log(`Unable to get blockTime for ${signature}`);
          }
        })
        .catch((err) => {
          NodeLogger.getInstance().error(err, this.eventName);
        });
    });

    return feedUpdateTimeDelays;
  }

  debugLogging(
    readyRowsAll: Array<types.CrankRow>,
    poppedRows: Array<types.CrankRow>
  ) {
    const nextTimestampCounts: Map<number, number> = readyRowsAll.reduce(
      (map, row) => {
        const nextTimestamp = row.nextTimestamp.toNumber();
        const currCount = map.get(nextTimestamp) ?? 0;
        map.set(nextTimestamp, currCount + 1);
        return map;
      },
      new Map<number, number>()
    );

    console.log(
      "\x1b[32m%s\x1b[0m",
      `${new Date().toUTCString()}: CrankPop sending ${Math.min(
        poppedRows.length,
        MAXIMUM_NUMBER_OF_READY_ROWS
      )} / ${readyRowsAll.length} txns, staleness = ${
        this.provider.solanaTime.toNumber() -
        readyRowsAll[0].nextTimestamp.toNumber()
      } seconds (${this.provider.solanaTime.toNumber()})`
    );
    Array.from(nextTimestampCounts.entries()).map(([timestamp, count]) => {
      const message = `${timestamp}: ${count} rows`;
      const hasPoppedRows = poppedRows.filter(
        (r) => r.nextTimestamp.toNumber() === timestamp
      );
      if (hasPoppedRows.length) {
        ConsoleLogger.green(message);
      } else {
        console.log(message);
      }
    });
  }

  routine = async () => {
    const crankRows = await this.getCrankRows();

    // record new event if top of crank moved or next row isnt ready yet
    const topOfCrank = crankRows[0].nextTimestamp.toNumber();
    if (
      topOfCrank > this._nextTimestamp ||
      topOfCrank > Math.round(Date.now() / 1000)
    ) {
      this.newEvent();
      this._nextTimestamp = topOfCrank;
    }

    // use 2 sec offset for future rows to be popped
    const solanaTime = this.provider.solanaTime.add(new BN(CRANK_LEAD_SECONDS));
    const readyRowsAll = (crankRows ?? []).filter((row: types.CrankRow) =>
      solanaTime.gte(row.nextTimestamp)
    );
    const rowsToPop = readyRowsAll.slice(0, MAXIMUM_NUMBER_OF_READY_ROWS);
    if (readyRowsAll.length === 0 || rowsToPop.length === 0) {
      return;
    }

    // only page if there are rows ready to be popped
    // we can use this to use backup rpc if staleness exceeds some threshold
    this.checkStaleness();

    if (SolanaEnvironment.VERBOSE()) {
      this.debugLogging(readyRowsAll, rowsToPop);
    }

    // purposely do not await this, want to move on as quick as possible to the next iteration
    // not awaiting this may cause alot of txns to fail

    const signaturePromises = this.provider.crankPop(
      rowsToPop.map((r) => r.pubkey)
    );

    // wrap in a timeout so we can use unref and ignore the effects
    setTimeout(async () => {
      await this.handleSignatures(readyRowsAll, signaturePromises);
    }, 0).unref();

    return;
  };

  // handle the result of the signatures
  handleSignatures = async (
    readyRowsAll: Array<types.CrankRow>,
    signaturePromises: Promise<Array<Promise<string>>>
  ) => {
    try {
      const txnPromises = await signaturePromises;
      await Promise.allSettled(txnPromises)
        .then((signaturePromises) => {
          const signatures = signaturePromises
            .filter(
              (x): x is PromiseFulfilledResult<string> =>
                x.status === "fulfilled"
            )
            .map((r) => r.value);
          NodeLogger.getInstance().info(
            `CrankPop: Sent ${signatures.length} transactions for ${readyRowsAll.length} ready feeds`
          );

          if (SolanaEnvironment.VERBOSE()) {
            NodeLogger.getInstance().info(
              `CrankPop Signature(s) - ${signatures.join(", ")}`
            );
          }

          // stall check
          this.newResponse();
          // this.checkFeedUpdateTimeDelays(signatures, readyRowsAll);
        })
        .catch((error) => {
          NodeLogger.getInstance().error(
            `Failed to send CrankPop batch: ${error}`
          );
        });
    } catch (error) {
      if (this.errorHandler) {
        await this.errorHandler(error);
      } else {
        NodeLogger.getInstance().log("Crank turn failed.");
        NodeLogger.getInstance().error((error as any).toString());
      }
    }
  };
}
