import { SolanaEnvironment } from "../../../env/SolanaEnvironment";
import { Sgx } from "../../../modules/sgx";
import type { SwitchboardTaskRunner } from "../../../modules/task-runner";
import type { App } from "../../../types";
import { SwitchboardApp } from "../../../types";
import { initializeAndPollForVerification } from "../attestation-service";
import { BufferRelayerOpenRoundEvent } from "../events/BufferRelayerOpenRound";
import { AggregatorOpenRoundEvent } from "../events/OpenRound";
import { VrfRequestRandomnessEvent } from "../events/RequestRandomness";
import { Nonce } from "../nonce";
import { HeartbeatRoutine } from "../routines/Heartbeat";
import { UnwrapStakeRoutine } from "../routines/UnwrapStake";

import type { ISolanaOracleProvider } from "./OracleProvider";
import { SolanaOracleProvider } from "./OracleProvider";

import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import type { Cluster, Connection } from "@solana/web3.js";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import type { ChainType } from "@switchboard-xyz/common";
import { Big } from "@switchboard-xyz/common";
import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { types } from "@switchboard-xyz/solana.js";
import {
  OracleAccount,
  PermissionAccount,
  QueueAccount,
  QueueDataBuffer,
  SB_V2_PID,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
const { createHash } = require("crypto");

export interface ISolanaOracle {
  provider: ISolanaOracleProvider;
  routines: SwitchboardEventDispatcher[];
  mainnetProgram: SwitchboardProgram;
  mainnetConnection: Connection;
}

export class SolanaOracle extends SwitchboardApp implements ISolanaOracle {
  chain: ChainType = "solana";
  app: App = "oracle";

  private constructor(
    readonly provider: SolanaOracleProvider,
    readonly routines: SwitchboardEventDispatcher[],
    readonly mainnetProgram: SwitchboardProgram,
    readonly mainnetConnection: Connection
  ) {
    super();
  }

  static async load(taskRunner: SwitchboardTaskRunner): Promise<SolanaOracle> {
    const env = SolanaEnvironment.getInstance();
    env.log();

    NodeLogger.getInstance().env("SGX_ENABLED", Sgx.isInEnclave().toString());

    if (env.SOLANA_DISABLE_ECVRF_BINARY && env.SOLANA_DISABLE_ECVRF_WASM) {
      NodeLogger.getInstance().info(
        `ECVRF disabled because SOLANA_DISABLE_ECVRF_BINARY and SOLANA_DISABLE_ECVRF_WASM were both set to true`
      );
    }

    // fetch cluster from genesis hash and set LOCALNET flag if needed
    await env.setCluster();
    if (env.isLocalnet) {
      NodeLogger.getInstance().env("LOCALNET", "true");
    }

    // load payer keypair
    const payerKeypair = await env.loadKeypair();

    NodeLogger.getInstance().env("PAYER", payerKeypair.publicKey.toBase58());

    const payerBalance =
      (await env.connection.getBalance(payerKeypair.publicKey)) /
      LAMPORTS_PER_SOL;
    NodeLogger.getInstance().env("PAYER_BALANCE", payerBalance.toString());
    if (payerBalance === 0) {
      throw new Error(
        `Payer has insufficient funds to heartbeat and initialize`
      );
    }

    // load switchboard program ID, check it is not SystemProgram
    const accountInfo = await env.connection.getAccountInfo(
      (SolanaEnvironment.getOracleKey() ?? SolanaEnvironment.getQueueKey())!
    );
    if (!accountInfo || accountInfo.owner === SystemProgram.programId) {
      throw new Error(`OracleAccount not found`);
    }
    const programId = accountInfo.owner;

    // load anchor program and oracle account
    const program = await SwitchboardProgram.load(
      env.connection,
      payerKeypair,
      programId
    );
    // load mainnet program
    const mainnetProgram = await SwitchboardProgram.load(
      env.mainnetSolanaConnection,
      payerKeypair,
      SB_V2_PID
    );

    // TODO: reverify on expired
    if (Sgx.isInEnclave()) {
      const queueAccount = new QueueAccount(program, env.SOLANA_QUEUE_KEY!);
      const authority = await env.loadAuthority();
      const oracleSeed = [
        Buffer.from("OracleAccountData"),
        Buffer.from(authority.secretKey),
      ];
      const hash = createHash("sha256");
      for (const x of oracleSeed) {
        hash.update(x);
      }
      const kp = Keypair.fromSeed(hash.digest());
      let oracleAccount: OracleAccount;
      try {
        [oracleAccount] = await OracleAccount.create(program, {
          queueAccount,
          authority,
          stakingWalletKeypair: kp,
        });
        env.SOLANA_ORACLE_KEY = oracleAccount.publicKey;
      } catch {
        [oracleAccount] = await OracleAccount.createInstructions(
          program,
          payerKeypair.publicKey,
          {
            queueAccount,
            authority,
            stakingWalletKeypair: kp,
          }
        );
        env.SOLANA_ORACLE_KEY = oracleAccount.publicKey;
      }
      const queueData = await queueAccount.loadData();
      try {
        const [permissionAccount] = PermissionAccount.fromSeed(
          program,
          queueData.authority,
          queueAccount.publicKey,
          oracleAccount.publicKey
        );
        await permissionAccount.loadData();
      } catch {
        await PermissionAccount.create(program, {
          authority: queueData.authority,
          granter: queueAccount.publicKey,
          grantee: oracleAccount.publicKey,
        });
      }

      const COMMITMENT = "confirmed";
      const sasQueue = new PublicKey(env.SOLANA_SAS_QUEUE_KEY);
      const sasInfo = await env.connection.getAccountInfo(sasQueue);
      const attestationServicePid = sasInfo.owner;
      const wallet = new anchor.Wallet(await env.loadKeypair());
      const provider = new anchor.AnchorProvider(env.connection, wallet, {
        commitment: COMMITMENT,
        preflightCommitment: COMMITMENT,
      });
      const idl = await anchor.Program.fetchIdl(
        attestationServicePid,
        provider
      );
      const attestProgram = new anchor.Program(
        idl!,
        attestationServicePid,
        provider
      );
      const quote = Sgx.generateQuote({
        pubkey: authority.publicKey.toBuffer(),
      });
      const quoteAccount = await initializeAndPollForVerification(
        attestProgram,
        {
          verifierQueue: env.SOLANA_SAS_QUEUE_KEY!,
          quoteData: quote,
        }
      );
    }

    const oracleAccount = new OracleAccount(program, env.oracleAddress);
    // load oracle data and check authority keypair
    const oracle = await oracleAccount.loadData();
    // if (!payerKeypair.publicKey.equals(oracle.oracleAuthority)) {
    // throw new Error(
    // `Invalid Oracle authority provided. Expected ${oracle.oracleAuthority}, received ${payerKeypair.publicKey}`
    // );
    // }

    // load queue and mint
    const [queueAccount, queue] = await QueueAccount.load(
      program,
      oracle.queuePubkey
    );

    // check permission account and permissions
    const [permissionAccount, permissionBump] = PermissionAccount.fromSeed(
      oracleAccount.program,
      queue.authority,
      queueAccount.publicKey,
      oracleAccount.publicKey
    );
    let permissions: types.PermissionAccountData;
    try {
      permissions = await permissionAccount.loadData();
    } catch (_) {
      throw new Error(
        "A requested permission pda account has not been initialized."
      );
    }

    // if (
    // permissions.permissions !==
    // types.SwitchboardPermission.PermitOracleHeartbeat.discriminator
    // ) {
    // throw new Error(
    // `Oracle needs PERMIT_ORACLE_HEARTBEAT permissions to join the queue ${queueAccount.publicKey}`
    // );
    // }

    const provider = await SolanaOracleProvider.load(
      queueAccount,
      queue,
      new QueueDataBuffer(queueAccount.program, queue.dataBuffer),
      oracleAccount,
      oracle.tokenAccount,
      env.NONCE_QUEUE_SIZE
    );

    // get events
    const routines: SwitchboardEventDispatcher[] = [];

    routines.push(
      new HeartbeatRoutine(provider, env.HEARTBEAT_INTERVAL),
      new AggregatorOpenRoundEvent(provider, taskRunner, queue.authority),
      new VrfRequestRandomnessEvent(provider)
    );

    if (queue.enableBufferRelayers) {
      routines.push(new BufferRelayerOpenRoundEvent(provider, taskRunner));
    }

    if (env.UNWRAP_STAKE_THRESHOLD && env.UNWRAP_STAKE_THRESHOLD > 0) {
      const unwrapNonce = await Nonce.getUnwrapStakeNonceAccount(
        oracleAccount,
        provider.payer
      );
      routines.push(
        new UnwrapStakeRoutine(
          oracleAccount,
          new Big(env.UNWRAP_STAKE_THRESHOLD),
          env.HEARTBEAT_INTERVAL,
          oracle,
          queue,
          unwrapNonce,
          await program.connection.getMinimumBalanceForRentExemption(
            spl.AccountLayout.span
          )
        )
      );
    }

    return new SolanaOracle(
      provider,
      routines,
      mainnetProgram,
      mainnetProgram.provider.connection
    );
  }
}
