import { SolanaEnvironment } from "../../../env/SolanaEnvironment";
import type { SolanaOracleProvider } from "../oracle/OracleProvider";

import { OracleJob } from "@switchboard-xyz/common";
import { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { SwitchboardEvents } from "@switchboard-xyz/solana.js";
import { BufferRelayerAccount, JobAccount } from "@switchboard-xyz/solana.js";
import type { TaskRunner } from "@switchboard-xyz/task-runner";

export class BufferRelayerOpenRoundEvent extends SwitchboardEventDispatcher {
  eventName: keyof SwitchboardEvents = "BufferRelayerOpenRoundEvent";
  private ws?: number;

  constructor(
    readonly provider: SolanaOracleProvider,
    readonly taskRunner: TaskRunner
  ) {
    super();
    if (SolanaEnvironment.parseBoolean("SOLANA_EVENT_WATCHER_AUTORECONNECT")) {
      setInterval(async () => {
        await this.restart();
      }, 1 * 60 * 60 * 1000).unref(); // restart open round watcher every 1hr
    }
  }

  async start(): Promise<void> {
    NodeLogger.getInstance().info(
      `Watching event: ${this.eventName} ...`,
      "Oracle"
    );
    this.ws = await this.provider.program.addEventListener(
      "BufferRelayerOpenRoundEvent",
      this.callback
    );
  }

  async stop(): Promise<void> {
    if (this.ws !== undefined) {
      NodeLogger.getInstance().info(
        `Stopping Event ${this.eventName} ...`,
        "Oracle"
      );
      this.provider.program.removeEventListener(this.ws);
    }
  }

  callback = async (
    event: SwitchboardEvents["BufferRelayerOpenRoundEvent"]
  ) => {
    // let vars = configs.jobVariables?.[data.jobPubkey.toBase58()] ?? {};
    const oracleAccount = this.provider.oracleAccount;
    if (!event.oraclePubkeys[0].equals(oracleAccount.publicKey)) {
      return;
    }

    NodeLogger.getInstance().info(
      `${this.eventName}: Event received for ${event.relayerPubkey}`,
      event.relayerPubkey.toBase58()
    );
    this.newEvent();

    const jobAccount = new JobAccount(this.provider.program, event.jobPubkey);
    const bufferRelayerAccount = new BufferRelayerAccount(
      this.provider.program,
      event.relayerPubkey
    );
    const bufferRelayer = await bufferRelayerAccount.loadData();

    const { permissionAccount, permissionBump } =
      bufferRelayerAccount.getAccounts(
        this.provider.queueAccount,
        this.provider.queueAuthority
      );

    let result: Buffer = Buffer.from("");
    let success = true;
    try {
      const job = await jobAccount.loadData();
      const oracleJob = OracleJob.decodeDelimited(job.data);
      const receipt = await this.taskRunner.performAsBuffer(
        jobAccount.publicKey.toString(),
        oracleJob
      );
      if ("result" in receipt) {
        result = receipt.result;
      }
      if ("error" in receipt) {
        throw receipt.error;
      }
    } catch (e: unknown) {
      NodeLogger.getInstance().error(
        `Error: Buffer relayer failed - ${e}`,
        bufferRelayerAccount.publicKey.toBase58()
      );
      result = Buffer.from((e as any).toString());
      success = false;
    }

    NodeLogger.getInstance().info(
      `Result: ${result}`,
      bufferRelayerAccount.publicKey.toBase58()
    );

    const sig = await this.provider.sendBufferSaveResult(bufferRelayerAccount, {
      result: result.slice(0, 500),
      success,
      escrow: bufferRelayer.escrow,
      queueAccount: this.provider.queueAccount,
      queueAuthority: this.provider.queueAuthority,
      queueDataBuffer: this.provider.queueDataBuffer.publicKey,
      oracleAccount: this.provider.oracleAccount,
      oracleAuthority: this.provider.payer.publicKey,
      oracleTokenAccount: this.provider.tokenWallet,
      permissionAccount: permissionAccount,
      permissionBump: permissionBump,
    });

    NodeLogger.getInstance().info(
      `save_result signature: ${sig}`,
      bufferRelayerAccount.publicKey.toBase58()
    );

    // stall check
    this.newResponse();
  };
}
