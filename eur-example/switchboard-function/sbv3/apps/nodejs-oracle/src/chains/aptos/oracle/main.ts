import { AptosEnvironment } from "../../../env/AptosEnvironment";
import type { SwitchboardTaskRunner } from "../../../modules/task-runner";
import type { App } from "../../../types";
import { SwitchboardApp } from "../../../types";
import { OpenRoundEvent } from "../events/OpenRound";
import { BatchSaveResult } from "../routines/BatchSaveResult";

import { OracleAccount } from "@switchboard-xyz/aptos.js";
import type { ChainType } from "@switchboard-xyz/common";
import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { AptosAccount, AptosClient } from "aptos";
import { HexString } from "aptos";

export interface IAptosOracle {
  routines: SwitchboardEventDispatcher[];
  client: AptosClient;
  oracle: OracleAccount;
  account: AptosAccount;
}

export class AptosOracle extends SwitchboardApp implements IAptosOracle {
  chain: ChainType = "aptos";
  app: App = "oracle";

  private constructor(
    readonly routines: SwitchboardEventDispatcher[],
    readonly client: AptosClient,
    readonly oracle: OracleAccount,
    readonly account: AptosAccount
  ) {
    super();
  }

  static async load(taskRunner: SwitchboardTaskRunner): Promise<AptosOracle> {
    const env = AptosEnvironment.getInstance();
    env.log();

    const client = env.client;

    // set NETWORK_ID manually
    await env.setNetwork();

    const account = await env.loadAccount();
    NodeLogger.getInstance().env("APTOS_PAYER", account.address().toString());

    // TODO: Verify payer balance

    const oracle = new OracleAccount(
      client,
      env.oracleAddress,
      HexString.ensure(env.APTOS_PID)
    );
    const oracleData = await oracle.loadData();

    if (oracleData.authority.toString() !== account.address().toString()) {
      throw new Error(
        `Authority does not match expected address, expected ${
          oracleData.authority
        }, received ${account.address()}`
      );
    }

    const sig = await oracle.heartbeat(account);
    NodeLogger.getInstance().debug(`Heartbeat Signature: ${sig}`);

    // batchRoutine will periodically heartbeat
    const batchRoutine = new BatchSaveResult(
      account,
      oracle,
      env.HEARTBEAT_INTERVAL,
      oracleData.lastHeartbeat.toNumber()
    );

    const routines: SwitchboardEventDispatcher[] = [
      batchRoutine,
      new OpenRoundEvent(taskRunner, oracle, account, batchRoutine),
    ];

    return new AptosOracle(routines, client, oracle, account);
  }
}
