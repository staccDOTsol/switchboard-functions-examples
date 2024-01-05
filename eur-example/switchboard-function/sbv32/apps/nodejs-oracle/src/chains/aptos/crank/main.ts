import { AptosEnvironment } from "../../../env/AptosEnvironment";
import { SwitchboardTaskRunner } from "../../../modules/task-runner";
import type { App } from "../../../types";
import { SwitchboardApp } from "../../../types";
import { CrankPopRoutine } from "../routines/CrankPop";

import { CrankAccount } from "@switchboard-xyz/aptos.js";
import type { ChainType } from "@switchboard-xyz/common";
import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { AptosAccount } from "aptos";
import { AptosClient } from "aptos";

export class AptosCrank extends SwitchboardApp {
  chain: ChainType = "aptos";
  app: App = "crank";

  constructor(
    readonly client: AptosClient,
    readonly account: AptosAccount,
    readonly crank: CrankAccount,
    readonly routines: Array<SwitchboardEventDispatcher>
  ) {
    super();
  }

  public static async load(): Promise<AptosCrank> {
    const env = AptosEnvironment.getInstance();
    env.log();

    const client = new AptosClient(env.APTOS_RPC_URL);

    const account = await env.loadAccount();
    // TODO: Verify payer balance
    NodeLogger.getInstance().env("PAYER_KEY", account.address().toString());

    const crank = new CrankAccount(client, env.crankAddress, env.APTOS_PID);
    const crankData = await crank.loadData();
    NodeLogger.getInstance().env("CRANK_KEY", crank.address.toString());

    const taskRunner = await SwitchboardTaskRunner.load();

    const crankPopRoutine = new CrankPopRoutine(crank, account, taskRunner);

    return new AptosCrank(client, account, crank, [crankPopRoutine]);
  }
}
