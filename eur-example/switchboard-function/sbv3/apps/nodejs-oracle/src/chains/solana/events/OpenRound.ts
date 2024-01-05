import { SolanaEnvironment } from "../../../env/SolanaEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import { Sgx } from "../../../modules/sgx";
import type {
  SwitchboardTaskRunner,
  TaskRunnerResult,
} from "../../../modules/task-runner";
import {
  filterJobResults,
  taskRunnerSuccess,
} from "../../../modules/task-runner";
import { NodeTelemetry } from "../../../modules/telemetry";
import { VERSION } from "../../../version";
import { QuoteAccount } from "../attestation-service";
import type { SolanaOracleProvider } from "../oracle/OracleProvider";

import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import type {
  Commitment,
  Keypair,
  TransactionResponse,
  TransactionSignature,
} from "@solana/web3.js";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { buf2String, type OracleJob } from "@switchboard-xyz/common";
import { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { PagerDuty } from "@switchboard-xyz/node/alerts/pager-duty";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import * as sbv2 from "@switchboard-xyz/solana.js";
import chalk from "chalk";
import LRUCache from "lru-cache";

function calculateMedian(numbers: number[]): number {
  const sortedNumbers = numbers.slice().sort((a, b) => a - b);
  const middleIndex = sortedNumbers.length / 2;

  return sortedNumbers[Math.floor(middleIndex)];
}

export class AggregatorOpenRoundEvent extends SwitchboardEventDispatcher {
  eventName: keyof sbv2.SwitchboardEvents = "AggregatorOpenRoundEvent";
  private ws?: number;

  aggregatorCache: Map<string, Promise<sbv2.types.AggregatorAccountData>>;
  jobCache = new LRUCache<string, OracleJob>({
    max: 10_000,
  });
  configs: any;
  payer: Keypair;
  authority: Keypair;
  oracle: any;
  autoFee: number;
  wallet: anchor.Wallet;
  startTimestamp: number;

  constructor(
    readonly provider: SolanaOracleProvider,
    readonly taskRunner: SwitchboardTaskRunner,
    readonly queueAuthority: PublicKey
  ) {
    super();
    this.aggregatorCache = new Map<string, Promise<any>>();
    this.configs = {};
    this.payer = null;
    this.authority = null;
    this.oracle = null;
    this.wallet = null;
    this.startTimestamp = Math.floor(Date.now() / 1000);
    if (SolanaEnvironment.parseBoolean("SOLANA_EVENT_WATCHER_AUTORECONNECT")) {
      setInterval(async () => {
        await this.restart();
      }, 1 * 60 * 60 * 1000).unref(); // restart open round watcher every 1hr
    }
  }

  async start(): Promise<void> {
    console.log(`Oracle version ${VERSION}`);
    const connection = this.provider.program.provider.connection;
    NodeLogger.getInstance().info(
      `Watching event: ${this.eventName} ...`,
      "Oracle"
    );
    this.ws = await this.provider.program.addEventListener(
      "AggregatorOpenRoundEvent",
      this.callback
    );
    const env = SolanaEnvironment.getInstance();
    this.payer = await env.loadKeypair();
    this.authority = await env.loadAuthority();
    this.oracle = await this.provider.oracleAccount.loadData();
    this.wallet = new anchor.Wallet(this.payer);
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

  async genProgram(
    rpcUrl: string,
    commitment: Commitment
  ): Promise<sbv2.SwitchboardProgram> {
    const connection = new Connection(rpcUrl, commitment);
    const providerConnection = new anchor.AnchorProvider(
      connection,
      this.wallet,
      {
        commitment: commitment,
        preflightCommitment: commitment,
      }
    );
    return await sbv2.SwitchboardProgram.fromProvider(providerConnection);
  }

  callback = async (event: sbv2.AggregatorOpenRoundEvent): Promise<void> => {
    const env = SolanaEnvironment.getInstance();
    const pageKey = SolanaEnvironment.getPagerDutyKey() ?? "";
    const summary = "Unresolved main loop fetch fail";
    const chain = SolanaEnvironment.getChain();
    const network = SolanaEnvironment.getCluster();
    const pager = PagerDuty.getInstance(); //(pageKey, summary, chain, network);
    const oracleIdx = event.oraclePubkeys.findIndex((key) =>
      key.equals(this.provider.oracleAccount.publicKey)
    );
    if (oracleIdx === -1) {
      return;
    }

    this.newEvent();

    // console.log(`Program RPC ${this.provider.program.connection.rpcEndpoint}`);
    // console.log(
    // `TaskRunner RPC ${this.taskRunner.program.connection.rpcEndpoint}`
    // );
    const program = await this.genProgram(
      this.provider.program.connection.rpcEndpoint,
      "processed"
    );
    this.taskRunner.program = await this.genProgram(
      this.taskRunner.program.connection.rpcEndpoint,
      "processed"
    );
    const provider = this.provider;
    let [aggregatorAccount, aggregator] = [null, null];
    try {
      [aggregatorAccount, aggregator] = await sbv2.AggregatorAccount.load(
        program,
        event.feedPubkey
      );
    } catch (e) {
      console.log(
        chalk.red(`Error: Fetch failed for feed ${event.feedPubkey}`)
      );
      console.log("sending page");
      await pager.sendEvent(
        "critical",
        `Fetch failed for feed ${event.feedPubkey}`,
        { error: e }
      );
      return;
    }
    let autoFee = calculateMedian(
      (
        await program.provider.connection.getRecentPrioritizationFees({
          lockedWritableAccounts: [aggregatorAccount.publicKey],
        })
      ).map((x) => x.prioritizationFee)
    );
    // 1 Lamport = 0.000000001 SOL
    // 1 microLamport = 0.000001 Lamports.
    if (autoFee > 100_000) {
      autoFee = 100_000;
    }
    // console.log(`Autofee ${autoFee}`);
    const aggregatorName = buf2String(aggregator.name);
    const id =
      `${
        aggregatorName !== undefined ? "(" + aggregatorName + ") " : ""
      }${aggregatorAccount.publicKey.toBase58()}` ?? "Unknown Feed";

    let saveResultPromise: Promise<TransactionSignature>;
    let feedResult: TaskRunnerResult;
    try {
      const jobs = (await aggregatorAccount.loadJobs(aggregator)).map((j) => {
        return { ...j, jobKey: j.account.publicKey.toBase58() };
      });

      feedResult = await this.taskRunner.runJobs(jobs, {
        address: aggregatorAccount.publicKey.toString(),
        name: buf2String(aggregator.name),
        minJobResults: aggregator.minJobResults,
        latestRoundResult: aggregator.latestConfirmedRound.result.toBig(),
        latestRoundTimestamp:
          aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber(),
        varianceThreshold: aggregator.varianceThreshold.toBig(),
        forceReportPeriod: aggregator.forceReportPeriod.toNumber(),
      });

      if (!taskRunnerSuccess(feedResult)) {
        // we already logged
        return;
      }

      NodeLogger.getInstance().info(
        `Responding to ${id}: ${feedResult?.median}; all: ${JSON.stringify(
          feedResult?.jobs
            .filter(filterJobResults)
            .map((r) => r.result.toNumber())
        )}`,
        id
      );

      if (!Sgx.isInEnclave()) {
        const oracles = await aggregatorAccount.loadCurrentRoundOracles(
          aggregator
        );
        const saveResultParams: sbv2.AggregatorSaveResultAsyncParams = {
          oracleIdx,
          error: false,
          value: feedResult.median,
          minResponse: feedResult.min,
          maxResponse: feedResult.max,
          jobs: feedResult.jobs.map((j) => j.job),
          queueAuthority: this.queueAuthority,
          oracleAccount: provider.oracleAccount,
          oracles: oracles,
          extraPriorityFee: autoFee + 8000,
        };
        // TODO: check if this provier connection persists ok
        saveResultPromise = provider
          .sendSaveResult(aggregatorAccount, aggregator, saveResultParams)
          .then((signature) => {
            NodeTelemetry.getInstance().sendFeedResult({
              environment: SolanaEnvironment.getInstance(),
              aggregatorAddress: aggregatorAccount.publicKey.toBase58(),
              oracleAddress: provider.oracleAccount.publicKey.toBase58(),
              feedResult: feedResult,
              signature: signature,
            });
            return signature;
          });
      } else {
        const [stateAccount, stateBump] =
          sbv2.ProgramStateAccount.fromSeed(program);
        const [feedPermissionAccount, feedPermissionBump] =
          sbv2.PermissionAccount.fromSeed(
            program,
            this.queueAuthority,
            aggregator.queuePubkey,
            aggregatorAccount.publicKey
          );
        const [oraclePermissionAccount, oraclePermissionBump] =
          sbv2.PermissionAccount.fromSeed(
            program,
            this.queueAuthority,
            aggregator.queuePubkey,
            provider.oracleAccount.publicKey
          );
        const [leaseAccount, leaseBump] = sbv2.LeaseAccount.fromSeed(
          program,
          aggregator.queuePubkey,
          aggregatorAccount.publicKey
        );
        const [slider] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("SlidingResultAccountData"),
            aggregatorAccount.publicKey.toBytes(),
          ],
          program.oracleProgramId
        );
        const [rewardWallet] = await PublicKey.findProgramAddress(
          [
            this.payer.publicKey.toBuffer(),
            spl.TOKEN_PROGRAM_ID.toBuffer(),
            spl.NATIVE_MINT.toBuffer(),
          ],
          spl.ASSOCIATED_TOKEN_PROGRAM_ID
        );
        let historyBuffer = aggregator.historyBuffer;
        if (historyBuffer.equals(PublicKey.default)) {
          historyBuffer = aggregatorAccount.publicKey;
        }
        const accounts = {
          aggregator: aggregatorAccount.publicKey,
          oracle: provider.oracleAccount.publicKey,
          oracleWallet: this.oracle.tokenAccount,
          oracleAuthority: this.oracle.oracleAuthority,
          oracleQueue: aggregator.queuePubkey,
          queueAuthority: event.queueAuthority,
          feedPermission: feedPermissionAccount.publicKey,
          oraclePermission: oraclePermissionAccount.publicKey,
          lease: leaseAccount.publicKey,
          escrow: (await leaseAccount.loadData()).escrow,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          programState: stateAccount.publicKey,
          historyBuffer,
          mint: spl.NATIVE_MINT,
          slider,
          quote: QuoteAccount.keypairFromAssociated(this.authority.publicKey)
            .publicKey,
          rewardWallet,
          payer: this.payer.publicKey,
          systemProgram: SystemProgram.programId,
        };
        const params = {
          value: sbv2.types.SwitchboardDecimal.fromBig(feedResult.median),
          minResponse: sbv2.types.SwitchboardDecimal.fromBig(feedResult.min),
          maxResponse: sbv2.types.SwitchboardDecimal.fromBig(feedResult.max),
          jobsChecksum: [
            ...aggregatorAccount
              .produceJobsHash(jobs.map((x) => x.job))
              .digest(),
          ],
          feedPermissionBump,
          oraclePermissionBump,
          leaseBump,
          stateBump,
        };
        const p = (program as any)._program;
        const tx = await p.methods
          .aggregatorTeeSaveResult(params)
          .accounts(accounts)
          .signers([this.payer, this.authority])
          .transaction();
        saveResultPromise = aggregatorAccount.program.connection
          .sendTransaction(tx, [this.payer, this.authority])
          .then((signature) => {
            NodeTelemetry.getInstance().sendFeedResult({
              environment: SolanaEnvironment.getInstance(),
              aggregatorAddress: aggregatorAccount.publicKey.toBase58(),
              oracleAddress: provider.oracleAccount.publicKey.toBase58(),
              feedResult: feedResult,
              signature: signature,
            });
            return signature;
          });
      }
    } catch (error) {
      this.handleError(id, error);
    }

    // handle telemetry + logging
    try {
      await saveResultPromise!
        .then((signature: TransactionResponse | string) => {
          if (typeof signature !== "string") {
            return;
          }

          NodeLogger.getInstance().info(
            `save_result signature: ${signature}`,
            id
          );

          // stall check
          this.newResponse();

          // handle metrics
          if (!SolanaEnvironment.getInstance().isLocalnet) {
            setTimeout(() => {
              NodeMetrics.getInstance()?.handleNewRound(
                /* address= */ aggregatorAccount.publicKey.toString(),
                /* latestRoundOpenTimestamp= */ aggregator.latestConfirmedRound.roundOpenTimestamp.toNumber(),
                /* feedResult= */ feedResult,
                /* currentTime= */ this.provider.solanaTime.toNumber()
              );
              const env = SolanaEnvironment.getInstance();
              if (env.NETWORK_ID === "mainnet-beta") {
                // send telemetry metrics when the event queue is ready
                NodeTelemetry.getInstance()
                  .sendTransactionSignature(
                    signature,
                    provider.queueAccount.publicKey.toBase58()
                  )
                  .catch();
              }
            }, 0);
          }
        })
        .catch(async (error) => {
          NodeLogger.getInstance().error(
            chalk.red(
              `Error: Unknown error occured ${event.feedPubkey} ${error}`
            ),
            id
          );
          // await pager.sendPage(error);
          this.handleError(id, error);
        });
    } catch (e) {
      console.log("sending page");
      await pager.sendEvent(
        "info",
        `SaveResult failed for feed ${event.feedPubkey}`,
        { error: e }
      );
      console.log(
        chalk.red(`Error: Save result failed for feed ${event.feedPubkey}`)
      );
      this.handleError(id, e);
      return;
    }
  };

  handleError(id: string, error: unknown) {
    NodeLogger.getInstance().error(
      `ERROR on ${id}, ${
        error instanceof Error && "stack" in error ? error.stack : error
      }`,
      id
    );
    if (SolanaEnvironment.VERBOSE()) {
      console.error(error);
    }
    this.onSaveResultTxFailure(error, id).catch();
  }

  async onSaveResultTxFailure(error: unknown, feedName: string) {
    const pager = PagerDuty.getInstance();
    NodeLogger.getInstance().warn(
      `[Error] Failed to fulfill transaction. ${
        error instanceof Error && "stack" in error ? error.stack : error
      }`,
      feedName
    );

    NodeMetrics.getInstance()?.saveResultFailure();
    const now = Math.floor(Date.now() / 1000);
    if (now - this.startTimestamp < 1800) {
      NodeLogger.getInstance().warn(
        `[Error] Failed to fulfill transaction. Sending page: too close to bootup`,
        feedName
      );
      await pager.sendEvent(
        "critical",
        `SaveResult failed for feed ${feedName}`,
        { error }
      );
    }
    process.exit(1);
  }
}
