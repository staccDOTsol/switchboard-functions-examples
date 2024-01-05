import { SolanaEnvironment } from "../../../env/SolanaEnvironment";
import type { App } from "../../../types";
import { SwitchboardApp } from "../../../types";
import { CrankPopRoutine } from "../routines/CrankPop";
import { SolanaProvider } from "../SolanaProvider";
import { DEFAULT_COMMITMENT } from "../types";

import { SolanaCrankProvider } from "./CrankProvider";

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import type { ChainType } from "@switchboard-xyz/common";
import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { extractBooleanEnvVar } from "@switchboard-xyz/node";
import {
  AnchorWallet,
  CrankAccount,
  ProgramStateAccount,
  QueueAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";

export class SolanaCrank extends SwitchboardApp {
  chain: ChainType = "solana";
  app: App = "crank";

  constructor(
    readonly provider: SolanaCrankProvider,
    readonly routines: SwitchboardEventDispatcher[]
  ) {
    super();
  }

  static async load(): Promise<SolanaCrank> {
    const env = SolanaEnvironment.getInstance();
    env.log();

    // fetch cluster from genesis hash and set LOCALNET flag if needed
    await env.setCluster();

    const payerKeypair = await env.loadKeypair();

    const anchorProvider = new AnchorProvider(
      env.connection,
      new Wallet(payerKeypair),
      { commitment: DEFAULT_COMMITMENT }
    );

    const crankAccountInfo = await anchorProvider.connection.getAccountInfo(
      env.crankAddress
    );
    if (!crankAccountInfo) {
      throw new Error(`Failed to find crank ${env.crankAddress}`);
    }

    const program = await SwitchboardProgram.fromProvider(
      anchorProvider,
      crankAccountInfo.owner
    );

    const [programStateAccount, sbState] = await ProgramStateAccount.load(
      program,
      program.programState.publicKey
    );

    const [crankAccount, crank] = await CrankAccount.load(
      program,
      env.crankAddress
    );
    const [queueAccount, queue] = await QueueAccount.load(
      program,
      crank.queuePubkey
    );

    const crankRows = await crankAccount.loadCrank(false);
    if (crankRows === undefined || crankRows.length === 0) {
      throw new Error(`Crank is empty, no rows to pop`);
    }

    const nonceQueue =
      extractBooleanEnvVar("ENABLE_SOLANA_CRANK_NONCE_QUEUE") &&
      env.NONCE_QUEUE_SIZE > 0
        ? await SolanaProvider.loadNonceAccounts(
            // we will need to modify the seed derivation if we want to run multiple cranks with the same payer
            // we could do it by the cranker's tokenWallet
            crankAccount,
            env.NONCE_QUEUE_SIZE
          )
        : [];

    const provider = new SolanaCrankProvider(
      queueAccount,
      queue,
      crankAccount,
      crank,
      crankRows,
      sbState.tokenVault,
      nonceQueue
    );

    const crankPopRoutine = new CrankPopRoutine(provider, crankRows);

    return new SolanaCrank(provider, [crankPopRoutine]);
  }
}
