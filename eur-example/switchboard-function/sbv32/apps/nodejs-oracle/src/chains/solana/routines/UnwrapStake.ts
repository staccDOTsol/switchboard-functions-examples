import { DEFAULT_LABELS, NodeMetrics } from "../../../modules/metrics";
import type { Nonce, NonceInformationWithContext } from "../nonce";

import * as anchor from "@coral-xyz/anchor";
import type { Connection, PublicKey } from "@solana/web3.js";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { OracleAccount, types } from "@switchboard-xyz/solana.js";
import {
  PermissionAccount,
  ProgramStateAccount,
  QueueAccount,
} from "@switchboard-xyz/solana.js";
import { Big, BigUtils } from "@switchboard-xyz/task-runner";

export class UnwrapStakeRoutine extends SwitchboardRoutine {
  eventName = "UnwrapStake";

  errorHandler = undefined;
  successHandler = undefined;
  retryInterval = undefined;

  oracleAuthority: Keypair;
  oracleTokenWallet: PublicKey;

  programStateAccount: ProgramStateAccount;
  stateBump: number;

  queueAccount: QueueAccount;
  queueAuthority: PublicKey;
  minStake: anchor.BN;

  permissionAccount: PermissionAccount;
  permissionBump: number;

  minimumStakingWalletAmount: anchor.BN;
  minimumStakingWalletAmountUi: Big;

  constructor(
    readonly oracleAccount: OracleAccount,
    readonly balanceThreshold: Big,
    readonly heartbeatIntervalSec: number,
    readonly oracleData: types.OracleAccountData,
    readonly queueData: types.OracleQueueAccountData,
    readonly unwrapNonce: Nonce,
    readonly splRentExemption: number
  ) {
    super(heartbeatIntervalSec * 1000);
    this.oracleAuthority = Keypair.fromSecretKey(
      oracleAccount.program.wallet.payer.secretKey
    );
    this.oracleTokenWallet = oracleData.tokenAccount;

    const [programStateAccount, stateBump] = ProgramStateAccount.fromSeed(
      this.oracleAccount.program
    );
    this.programStateAccount = programStateAccount;
    this.stateBump = stateBump;

    this.queueAccount = new QueueAccount(
      this.oracleAccount.program,
      oracleData.queuePubkey
    );
    this.queueAuthority = queueData.authority;
    this.minStake = queueData.minStake;

    const [permissionAccount, permissionBump] = PermissionAccount.fromSeed(
      this.oracleAccount.program,
      queueData.authority,
      this.queueAccount.publicKey,
      this.oracleAccount.publicKey
    );
    this.permissionAccount = permissionAccount;
    this.permissionBump = permissionBump;

    this.unwrapNonce = unwrapNonce;

    // minimum amount that must be left in staking wallet
    this.minimumStakingWalletAmount = this.minStake.isZero()
      ? // 0.1 wSOL
        new anchor.BN(0.1 * LAMPORTS_PER_SOL)
      : // 2x queue's minStake
        this.minStake.mul(new anchor.BN(2));

    this.minimumStakingWalletAmountUi = BigUtils.safeDiv(
      BigUtils.fromBN(this.minimumStakingWalletAmount),
      new Big(LAMPORTS_PER_SOL)
    );

    this.splRentExemption = splRentExemption;
  }

  routine = async () => {
    const nodeBalance = new Big(
      (await this.oracleAccount.program.provider.connection.getBalance(
        this.oracleAuthority.publicKey
      )) / LAMPORTS_PER_SOL
    );

    if (nodeBalance.lt(this.balanceThreshold)) {
      try {
        const stakingWalletAmount = (
          await this.oracleAccount.program.provider.connection.getTokenAccountBalance(
            this.oracleTokenWallet
          )
        ).value;

        const unwrapAmountBN = new anchor.BN(stakingWalletAmount.amount).sub(
          this.minimumStakingWalletAmount
        );

        if (unwrapAmountBN.lte(new anchor.BN(0))) {
          NodeLogger.getInstance().warn(
            `Warning: Node account ${this.oracleAccount.publicKey} balance is low\nPayer: ${this.oracleAuthority.publicKey}\nSOL: ${nodeBalance}\nFund the account soon to continue hosting your node.`
          );
          return;
        }

        const unwrapAmountUi =
          BigUtils.fromBN(unwrapAmountBN).div(LAMPORTS_PER_SOL);
        NodeLogger.getInstance().info(
          `NodeBalance: ${nodeBalance}, unwrapping ${unwrapAmountUi} SOL`
        );

        let unwrapNonceInfo: NonceInformationWithContext | undefined =
          undefined;

        // try to use nonce account for this
        try {
          const unwrapNonceAccount = await this.unwrapNonce.loadNonce();
          unwrapNonceInfo = await this.unwrapNonce.loadNonceInfo(
            unwrapNonceAccount,
            false
          );
        } catch (error) {
          NodeLogger.getInstance().warn(`UnwrapStakeNonceError: ${error}`);
          unwrapNonceInfo = undefined;
        }

        const unwrapStakeTx = await this.oracleAccount.withdrawInstruction(
          this.oracleAuthority.publicKey,
          {
            authority: this.oracleAuthority,
            unwrap: true,
            amount: unwrapAmountUi.toNumber(),
          },
          {
            enableDurableNonce: unwrapNonceInfo !== undefined,
          }
        );

        const signature = await this.oracleAccount.program.signAndSend(
          unwrapStakeTx,
          undefined,
          unwrapNonceInfo !== undefined
            ? {
                nonceInfo: unwrapNonceInfo,
                minContextSlot: unwrapNonceInfo.minContextSlot,
              }
            : undefined
        );
        NodeLogger.getInstance().info(
          `Successfully unwrapped ${unwrapAmountUi} wSOL from oracles staking wallet: ${signature}`
        );
        return;
      } catch (error) {
        NodeLogger.getInstance().warn(
          `Failed to unwrap oracle stake to payer wallet: ${error}`
        );
      }
    }
  };
}

export function makeNodeBalanceObserver(
  connection: Connection,
  oracleAuthority: PublicKey,
  nodeAccount: OracleAccount
) {
  const labels: Record<string, string> = {
    ...DEFAULT_LABELS,
    account: nodeAccount.publicKey.toString(),
  };

  NodeMetrics.getInstance()?.meter.createObservableGauge(
    "switchboard_node_balance",
    {
      description: "Latest quantity of SOL found in node account",
    },
    async (observerResult) => {
      try {
        const nodeBalance =
          (await connection.getBalance(oracleAuthority)) / LAMPORTS_PER_SOL;
        observerResult.observe(nodeBalance, labels);
      } catch (e) {}
    }
  );
}
