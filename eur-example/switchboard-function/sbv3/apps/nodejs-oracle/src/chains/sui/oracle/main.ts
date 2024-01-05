import { SuiEnvironment } from "../../../env/SuiEnvironment";
import type { SwitchboardTaskRunner } from "../../../modules/task-runner";
import type { App } from "../../../types";
import { SwitchboardApp } from "../../../types";
import { HeartbeatRoutine } from "../routines/HeartbeatRoutine";
import { UpdateRoutine } from "../routines/UpdateRoutine";

import type { JsonRpcProvider, Keypair } from "@mysten/sui.js";
import type { ChainType } from "@switchboard-xyz/common";
import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import { OracleAccount, OracleQueueAccount } from "@switchboard-xyz/sui.js";

export interface ISuiOracle {
  routines: SwitchboardEventDispatcher[];
  client: JsonRpcProvider;
  oracle: OracleAccount;
  account: Keypair;
}

export class SuiOracle extends SwitchboardApp implements ISuiOracle {
  chain: ChainType = "sui";
  app: App = "oracle";

  private constructor(
    readonly routines: SwitchboardEventDispatcher[],
    readonly client: JsonRpcProvider,
    readonly oracle: OracleAccount,
    readonly account: Keypair
  ) {
    super();
  }

  static async load(taskRunner: SwitchboardTaskRunner): Promise<SuiOracle> {
    const env = SuiEnvironment.getInstance();
    env.log();
    const client = env.client;

    const account = await env.loadAccount();
    const oracle_addr = account.getPublicKey().toSuiAddress();
    NodeLogger.getInstance().info(
      `SUI PAYER: ${account.getPublicKey().toSuiAddress()}`
    );

    const oracle = new OracleAccount(client, env.oracleAddress, env.SUI_PID);
    const oracleData = await oracle.loadData();

    if (oracleData.authority.toString() !== oracle_addr) {
      throw new Error(
        `Authority does not match expected address, expected ${oracleData.authority}, received ${oracle_addr}`
      );
    }

    const sig = await oracle.heartbeat(account, oracleData.queue_addr);
    NodeLogger.getInstance().debug(`Heartbeat Signature: ${sig}`);

    const queue = new OracleQueueAccount(
      client,
      oracleData.queue_addr,
      env.SUI_PID
    );

    const routines: SwitchboardEventDispatcher[] = [
      new HeartbeatRoutine(
        oracle,
        queue,
        account,
        env.HEARTBEAT_INTERVAL || 1000 * 60 * 30 // 30 minutes
      ),
      new UpdateRoutine(taskRunner, oracle, queue, account),
    ];

    return new SuiOracle(routines, client, oracle, account);
  }
}
