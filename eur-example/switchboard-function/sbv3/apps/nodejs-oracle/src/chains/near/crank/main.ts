import { NearEnvironment } from "../../../env/NearEnvironment";
import { SwitchboardTaskRunner } from "../../../modules/task-runner";
import type { App } from "../../../types";
import { SwitchboardApp } from "../../../types";
import { NearAccessKeyQueue } from "../NearAccessKey";
import { CrankPopRoutine } from "../routines/CrankPop";

import type { ChainType } from "@switchboard-xyz/common";
import { BN } from "@switchboard-xyz/common";
import {
  CrankAccount,
  EscrowAccount,
  SwitchboardProgram,
  toBase58,
} from "@switchboard-xyz/near.js";
import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";

export class NearCrank extends SwitchboardApp {
  chain: ChainType = "near";
  app: App = "crank";

  constructor(readonly routines: Array<SwitchboardEventDispatcher>) {
    super();
  }

  public static async load(): Promise<NearCrank> {
    const env = NearEnvironment.getInstance();
    env.log();

    const payerKeypair = await env.loadKeypair();

    const program = await SwitchboardProgram.loadFromKeypair(
      env.NETWORK_ID,
      env.NEAR_RPC_URL,
      env.NEAR_NAMED_ACCOUNT,
      payerKeypair
    );

    NodeLogger.getInstance().env("PAYER_NAMED_ACCOUNT", env.NEAR_NAMED_ACCOUNT);
    NodeLogger.getInstance().env(
      "PAYER_KEY",
      payerKeypair.getPublicKey().toString().split(":", 2)[1]
    );

    const taskRunner = await SwitchboardTaskRunner.load();

    const balance = await program.account.getAccountBalance();
    if (new BN(balance.available).eq(new BN(0))) {
      // 24 decimal places
      throw new Error(
        `EmptyPayerBalance: ${payerKeypair
          .getPublicKey()
          .toString()} has 0 available balance on ${env.NETWORK_ID}`
      );
    }

    const crankAccount = new CrankAccount({
      program,
      address: env.crankAddress,
    });

    NodeLogger.getInstance().env("CRANK_KEY", toBase58(crankAccount.address));

    const escrowAccount = await EscrowAccount.getOrCreateStaticAccount(
      program,
      "CrankWalletSeed"
    );

    NodeLogger.getInstance().env("ESCROW_KEY", toBase58(escrowAccount.address));

    const accessKeyQueue = await NearAccessKeyQueue.load(
      crankAccount,
      payerKeypair
    );

    NodeLogger.getInstance().env(
      "ACCESS_KEY_QUEUE_SUZE",
      accessKeyQueue.size.toString()
    );

    // NOTE: Need to start routine if sending actions through it
    // accessKeyQueue.start();

    const crankPopRoutine = new CrankPopRoutine(
      crankAccount,
      escrowAccount,
      payerKeypair,
      accessKeyQueue,
      taskRunner
    );

    return new NearCrank([crankPopRoutine]);
  }
}
