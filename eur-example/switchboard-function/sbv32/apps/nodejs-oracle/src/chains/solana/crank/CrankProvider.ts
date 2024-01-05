import { SolanaEnvironment } from "../../../env/SolanaEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import type { Nonce } from "../nonce";
import { SolanaProvider } from "../SolanaProvider";
import { DEFAULT_COMMITMENT } from "../types";

import type {
  Commitment,
  PublicKey,
  TransactionSignature,
} from "@solana/web3.js";
import { sleep } from "@switchboard-xyz/common";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type {
  AggregatorPdaAccounts,
  CrankAccount,
  QueueAccount,
  types,
} from "@switchboard-xyz/solana.js";
import {
  AccountNotFoundError,
  AggregatorAccount,
  CrankDataBuffer,
} from "@switchboard-xyz/solana.js";

const CRANK_DELAY =
  process.env.CRANK_DELAY && +process.env.CRANK_DELAY > 0
    ? Number.parseInt(process.env.CRANK_DELAY)
    : 0;

export class SolanaCrankProvider extends SolanaProvider {
  aggregators: Map<string, AggregatorPdaAccounts>;

  constructor(
    readonly queueAccount: QueueAccount,
    readonly queue: types.OracleQueueAccountData,
    readonly crankAccount: CrankAccount,
    readonly crank: types.CrankAccountData,
    crankRows: Array<types.CrankRow>,
    readonly tokenWallet: PublicKey,
    readonly nonceAccounts: Nonce[]
  ) {
    super(queueAccount, queue.authority, nonceAccounts);
    this.aggregators = this.crankAccount.getCrankAccounts(
      crankRows,
      queueAccount,
      queue.authority
    );
  }

  getAggregator(
    aggregatorPubkey: PublicKey
  ): [AggregatorAccount, AggregatorPdaAccounts] {
    const aggregatorAccount = new AggregatorAccount(
      this.program,
      aggregatorPubkey
    );
    const aggregatorAccounts = this.aggregators.get(
      aggregatorPubkey.toBase58()
    );
    if (aggregatorAccounts !== undefined) {
      return [aggregatorAccount, aggregatorAccounts];
    }

    const accounts = aggregatorAccount.getAccounts(
      this.queueAccount,
      this.queueAuthority
    );
    this.aggregators.set(aggregatorAccount.publicKey.toBase58(), accounts);
    return [aggregatorAccount, accounts];
  }

  async crankPop(
    readyPubkeysAll: PublicKey[]
  ): Promise<Array<Promise<TransactionSignature>>> {
    if (readyPubkeysAll.length === 0) {
      return [];
    }
    const readyAggregators = readyPubkeysAll.map((pubkey) =>
      this.getAggregator(pubkey)
    );

    if (this.queueSize) {
      try {
        const signatures: Array<Promise<TransactionSignature>> =
          await this.crankPopNonce(readyAggregators);
        return signatures;
      } catch (error) {
        NodeLogger.getInstance().error(
          (error as any).toString(),
          "CrankNonceQueue"
        );
      }
    }

    const signatures: Array<Promise<TransactionSignature>> =
      await this.crankPopBlockhash(readyAggregators);

    // set last crank pop if metrics are enabled
    NodeMetrics.setLastCrankPop();

    return signatures;
  }

  async crankPopBlockhash(
    readyAggregators: [AggregatorAccount, AggregatorPdaAccounts][]
  ): Promise<Array<Promise<TransactionSignature>>> {
    const txns = this.crankAccount.packAndPopInstructions(
      this.program.walletPubkey,
      {
        payoutTokenWallet: this.tokenWallet,
        queuePubkey: this.queueAccount.publicKey,
        queueAuthority: this.queue.authority,
        queueDataBuffer: this.queue.dataBuffer,
        crankDataBuffer: this.crank.dataBuffer,
        readyAggregators: readyAggregators,
        failOpenOnMismatch: true,
        priorityFeeMultiplier: 10,
      },
      {
        computeUnitPrice:
          SolanaEnvironment.getInstance().SOLANA_COMPUTE_UNIT_PRICE ?? 1,
        computeUnitLimit:
          SolanaEnvironment.getInstance().SOLANA_CRANK_POP_COMPUTE_UNITS,
        extraPriorityFee: 3000,
      }
    );

    const connection = this.nextConnection;

    const signatures: Array<Promise<TransactionSignature>> = [];
    for (const [i, txn] of txns.entries()) {
      signatures.push(this.sendTransaction(txn, connection, undefined));
      if (CRANK_DELAY && i !== txns.length - 1) {
        await sleep(CRANK_DELAY);
      }
    }

    if (signatures.length !== 0) {
      try {
        // Await confirmation
        const confirmation = await connection.confirmTransaction(
          await signatures[0],
          "confirmed"
        );
        console.log("Transaction confirmation status:", confirmation);
      } catch (error) {
        console.error("Error confirming transaction:", error);
      }
    }

    return signatures;
  }

  async crankPopNonce(
    readyAggregators: [AggregatorAccount, AggregatorPdaAccounts][]
  ): Promise<Array<Promise<TransactionSignature>>> {
    const nonceAccounts = await this.nextNonceBatch(readyAggregators.length);
    if (nonceAccounts.length !== readyAggregators.length) {
      throw new Error(`Failed to fetch enough nonce accounts`);
    }
    const txns = this.crankAccount.packAndPopInstructions(
      this.program.walletPubkey,
      {
        payoutTokenWallet: this.tokenWallet,
        queuePubkey: this.queueAccount.publicKey,
        queueAuthority: this.queue.authority,
        queueDataBuffer: this.queue.dataBuffer,
        crankDataBuffer: this.crank.dataBuffer,
        readyAggregators: readyAggregators,
        failOpenOnMismatch: true,
        priorityFeeMultiplier: 10,
      },
      {
        enableDurableNonce: true, // reserve space in txn for nonce ixn
        computeUnitPrice:
          SolanaEnvironment.getInstance().SOLANA_COMPUTE_UNIT_PRICE ?? 1,
        computeUnitLimit:
          SolanaEnvironment.getInstance().SOLANA_CRANK_POP_COMPUTE_UNITS,
      }
    );

    const connection = this.nextConnection;

    const signatures: Array<Promise<TransactionSignature>> = [];
    for (const [i, txn] of txns.entries()) {
      const nonce =
        i < nonceAccounts.length ? nonceAccounts[i] : await this.nextNonce();
      signatures.push(this.sendTransaction(txn, connection, nonce[1]));

      if (CRANK_DELAY && i !== txns.length - 1) {
        await sleep(CRANK_DELAY);
      }
    }

    return signatures;
  }

  public async fetchCrankRows(
    commitment: Commitment = DEFAULT_COMMITMENT,
    forceConnection = false
  ): Promise<Array<types.CrankRow>> {
    const crankRows =
      forceConnection ||
      SolanaEnvironment.getInstance().SOLANA_DISABLE_REST_CONNECTION
        ? await this.fetchConnectionCrankRows(commitment)
        : await this.fetchRestCrankRows(commitment);
    return crankRows;
  }

  private async fetchConnectionCrankRows(
    commitment: Commitment = DEFAULT_COMMITMENT
  ): Promise<Array<types.CrankRow>> {
    const bufferAccountInfo = await this.defaultConnection.getAccountInfo(
      this.crank.dataBuffer,
      commitment
    );
    if (bufferAccountInfo === null)
      throw new AccountNotFoundError(
        "Crank Data Buffer",
        this.crank.dataBuffer
      );
    const data = CrankDataBuffer.decode(bufferAccountInfo);
    return CrankDataBuffer.sort(data);
  }

  private async fetchRestCrankRows(
    commitment: Commitment = DEFAULT_COMMITMENT
  ): Promise<Array<types.CrankRow>> {
    const bufferAccountInfo = await this.fetchRestAccountInfo(
      this.crank.dataBuffer,
      this.defaultConnection.rpcEndpoint,
      commitment
    );
    if (bufferAccountInfo === null)
      throw new AccountNotFoundError(
        "Crank Data Buffer",
        this.crank.dataBuffer
      );
    const data = CrankDataBuffer.decode(bufferAccountInfo);
    return CrankDataBuffer.sort(data);
  }
}
