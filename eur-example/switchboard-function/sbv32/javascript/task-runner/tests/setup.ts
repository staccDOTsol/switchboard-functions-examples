// require("ts-node").register({
//   transpileOnly: true,
// });
import { TaskRunnerClients } from "../src/ctx/index.js";
import { TaskRunner } from "../src/index.js";

import type { Idl } from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { NATIVE_MINT } from "@solana/spl-token";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  AnchorWallet,
  NativeMint,
  SB_V2_PID,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import fs from "fs";
import path from "path";

export async function setupTaskRunner(): Promise<TaskRunner> {
  const mainnetEndpoint =
    process.env.SOLANA_MAINNET_RPC || clusterApiUrl("mainnet-beta");
  const connection = new Connection(mainnetEndpoint);

  const program = await SwitchboardProgram.load(connection);

  const clients = new TaskRunnerClients(program, connection, "MadeUpApiKey");
  const taskRunner = new TaskRunner(program, mainnetEndpoint, clients);

  return taskRunner;
}

export function setupTaskRunnerSync(): TaskRunner {
  const idl: Idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "idl.json"), "utf-8")
  );
  const mainnetEndpoint =
    process.env.SOLANA_MAINNET_RPC || clusterApiUrl("mainnet-beta");
  const connection = new Connection(mainnetEndpoint);

  const provider = new AnchorProvider(
    connection,
    new AnchorWallet(Keypair.fromSeed(new Uint8Array(32).fill(1))),
    {}
  );

  const anchorProgram = new Program(idl, SB_V2_PID, provider);

  const program = new SwitchboardProgram(provider, new NativeMint(provider));

  const clients = new TaskRunnerClients(program, connection, "MadeUpApiKey");
  const taskRunner = new TaskRunner(program, mainnetEndpoint, clients);

  return taskRunner;
}

export class TaskRunnerTestContext {
  private static _instance: TaskRunnerTestContext | undefined = undefined;

  private constructor(readonly runner: Promise<TaskRunner>) {}

  public static getInstance(): TaskRunnerTestContext {
    if (TaskRunnerTestContext._instance === undefined) {
      const runner = setupTaskRunner();
      this._instance = new TaskRunnerTestContext(runner);
      return this._instance;
    }

    return this._instance!;
  }

  public static getRunner(): Promise<TaskRunner> {
    return TaskRunnerTestContext.getInstance()!.runner;
  }

  public static async exit() {
    // const runner = await TaskRunnerTestContext.getRunner();
    // const worker = TaskRunnerWorker.getInstance();
    // await worker.kill();
  }
}
