/** Near Oracle TODO
 * - Connect oracle metrics balance watcher to near balance, poll every 60s?
 * ^ might need to do that for all oracles
 */

import { NearEnvironment } from "../../../env/NearEnvironment";
import type { SwitchboardTaskRunner } from "../../../modules/task-runner";
import type { App } from "../../../types";
import { SwitchboardApp } from "../../../types";
import {
  NearEnvironmentError,
  NearLowPayerBalanceError,
  NearPermissionError,
} from "../errors";
import { OpenRoundEvent } from "../events/OpenRound";
import { NearActionBatchQueue } from "../NearActionBatchQueue";
import { BalanceWatcherRoutine } from "../routines/BalanceWatcher";
import { HeartbeatRoutine } from "../routines/Heartbeat";

import type { ChainType } from "@switchboard-xyz/common";
import { BN, bs58 } from "@switchboard-xyz/common";
import {
  NearEvent,
  OracleAccount,
  PermissionAccount,
  QueueAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/near.js";
import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";

export interface INearOracle {
  routines: SwitchboardEventDispatcher[];
}

export class NearOracle extends SwitchboardApp implements INearOracle {
  chain: ChainType = "near";
  app: App = "oracle";

  private constructor(
    readonly routines: SwitchboardEventDispatcher[],
    readonly oracle: OracleAccount
  ) {
    super();
  }

  static async load(taskRunner: SwitchboardTaskRunner): Promise<NearOracle> {
    const env = NearEnvironment.getInstance();
    env.log();

    const payerKeypair = await env.loadKeypair();

    const program = await SwitchboardProgram.loadFromKeypair(
      env.NETWORK_ID,
      env.NEAR_RPC_URL,
      env.NEAR_NAMED_ACCOUNT,
      payerKeypair
    );

    const balance = await program.account.getAccountBalance();
    if (new BN(balance.available).eq(new BN(0))) {
      throw new NearLowPayerBalanceError(balance.available);
    }

    if (env.NEAR_ORACLE_KEY === undefined) {
      throw new NearEnvironmentError(
        `Need to provide $NEAR_ORACLE_KEY or $ORACLE_KEY`
      );
    }

    const oracleAccount = new OracleAccount({
      program,
      address: env.oracleAddress,
    });
    const oracle = await oracleAccount.loadData();

    // check authority

    const queueAccount = new QueueAccount({
      program,
      address: oracle.queue,
    });
    const queue = await queueAccount.loadData();
    NodeLogger.getInstance().env(
      "ORACLE_QUEUE",
      bs58.encode(queueAccount.address)
    );
    NodeLogger.getInstance().env("QUEUE_AUTHORITY", queue.authority);

    const permissionKey = PermissionAccount.keyFromSeed(
      queue.authority,
      queueAccount.address,
      oracleAccount.address
    );
    const permissionAccount = new PermissionAccount({
      program,
      address: permissionKey,
    });

    NodeLogger.getInstance().env(
      "PERMISSION_ACCOUNT",
      bs58.encode(permissionAccount.address)
    );
    const permission = await permissionAccount.loadData();
    if (permission.permissions !== 1) {
      throw new NearPermissionError(permission.permissions);
    }

    const accessKeyQueue = await NearActionBatchQueue.load(
      oracleAccount,
      payerKeypair
    );

    const openRoundEvent =
      (env.MAINNET_NEAR_LAKE_LISTENER || env.NETWORK_ID !== "mainnet") &&
      (env.NETWORK_ID === "mainnet" || env.NETWORK_ID === "testnet") // near lake only supports mainnet & testnet
        ? await NearEvent.fromNetwork(
            env.NETWORK_ID,
            program.programId,
            "AggregatorOpenRoundEvent"
          )
        : undefined;

    const routines: SwitchboardEventDispatcher[] = [
      accessKeyQueue, // watch queue and flush actions periodically
      new HeartbeatRoutine(
        oracleAccount,
        accessKeyQueue,
        env.HEARTBEAT_INTERVAL
      ),
      new OpenRoundEvent(
        taskRunner,
        accessKeyQueue,
        oracleAccount,
        openRoundEvent
      ),
      new BalanceWatcherRoutine(program),
    ];

    NodeLogger.getInstance().info(`Near oracle loaded`);

    return new NearOracle(routines, oracleAccount);
  }
}
