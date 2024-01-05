import { SolanaEnvironment } from "../../../env/SolanaEnvironment";
import { NodeMetrics } from "../../../modules/metrics";
import { QuoteAccount } from "../attestation-service";
import { Nonce } from "../nonce";
import { SolanaProvider } from "../SolanaProvider";

import type * as anchor from "@coral-xyz/anchor";
import type { TransactionSignature } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type {
  AggregatorPdaAccounts,
  AggregatorSaveResultAsyncParams,
  BufferRelayerAccount,
  BufferRelayerSaveResultSyncParams,
  OracleAccount,
  QueueAccount,
  QueueDataBuffer,
  types,
  VrfAccount,
  VrfLiteAccount,
} from "@switchboard-xyz/solana.js";
import {
  AggregatorAccount,
  PermissionAccount,
  ProgramStateAccount,
  TransactionObject,
} from "@switchboard-xyz/solana.js";

type SaveResult = (
  aggregatorAccount: AggregatorAccount,
  aggregator: types.AggregatorAccountData,
  params: AggregatorSaveResultAsyncParams
) => Promise<TransactionSignature>;

type PublishRandomness = (
  vrfAccount: VrfAccount,
  vrf: types.VrfAccountData,
  idx: number,
  counter: anchor.BN,
  proof: string
) => Promise<Array<TransactionSignature>>;

type BufferRelayerSaveResult = (
  bufferRelayerAccount: BufferRelayerAccount,
  params: BufferRelayerSaveResultSyncParams
) => Promise<TransactionSignature>;

export interface ISolanaOracleProvider {
  heartbeat(): Promise<TransactionSignature>;
  // heartbeatBlockhash(): Promise<TransactionSignature>;
  // heartbeatNonce(): Promise<TransactionSignature>;

  sendSaveResult: SaveResult;
  // sendSaveResultBlockhash: SaveResult;
  // sendSaveResultNonce: SaveResult;

  sendVrf: PublishRandomness;
  // sendVrfBlockhash: PublishRandomness;
  // sendVrfNonce: PublishRandomness;

  sendBufferSaveResult: BufferRelayerSaveResult;
}

export class SolanaOracleProvider
  extends SolanaProvider
  implements ISolanaOracleProvider
{
  dataFeedNonceEnabled = false;

  _heartbeatNonce?: Promise<Nonce>;

  readonly permissions: [PermissionAccount, number];

  aggregators: Map<string, AggregatorPdaAccounts>;

  constructor(
    readonly queueAccount: QueueAccount,
    readonly queue: types.OracleQueueAccountData,
    readonly queueDataBuffer: QueueDataBuffer,
    readonly oracleAccount: OracleAccount,
    readonly tokenWallet: PublicKey,
    readonly nonceAccounts: Nonce[]
  ) {
    super(queueAccount, queue.authority, nonceAccounts);

    this.aggregators = new Map();

    this.permissions = PermissionAccount.fromSeed(
      queueAccount.program,
      queue.authority,
      queueAccount.publicKey,
      oracleAccount.publicKey
    );

    this.dataFeedNonceEnabled = SolanaEnvironment.parseBoolean(
      "ENABLE_DATA_FEED_NONCE"
    );

    // TODO: We can watch the queue + buffer
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

  static async load(
    queueAccount: QueueAccount,
    queue: types.OracleQueueAccountData,
    queueDataBuffer: QueueDataBuffer,
    oracleAccount: OracleAccount,
    tokenWallet: PublicKey,
    nonceQueueSize: number
  ): Promise<SolanaOracleProvider> {
    const nonceAccounts = await SolanaProvider.loadNonceAccounts(
      oracleAccount,
      nonceQueueSize
    );

    return new SolanaOracleProvider(
      queueAccount,
      queue,
      queueDataBuffer,
      oracleAccount,
      tokenWallet,
      nonceAccounts
    );
  }

  get hbNonce(): Promise<Nonce> {
    if (this._heartbeatNonce === undefined) {
      this._heartbeatNonce = Nonce.getHeartbeatNonceAccount(
        this.oracleAccount,
        this.payer
      );
    }

    return this._heartbeatNonce;
  }

  async heartbeat(): Promise<TransactionSignature> {
    const queue = await this.queueAccount.loadData();
    const oracles = await this.queueAccount.loadOracles();

    let gcOracle = this.oracleAccount.publicKey;
    if (oracles.length !== 0) {
      gcOracle = oracles[queue.gcIdx];
    }

    const heartbeatIxn = this.oracleAccount.heartbeatInstruction(
      this.program.walletPubkey,
      {
        tokenWallet: this.tokenWallet,
        gcOracle: gcOracle,
        oracleQueue: this.queueAccount.publicKey,
        dataBuffer: queue.dataBuffer,
        permission: this.permissions,
      }
    );

    const heartbeatTxn = new TransactionObject(
      this.program.walletPubkey,
      [heartbeatIxn],
      []
    );
    const signature = await this.sendTransaction(heartbeatTxn);
    return signature;
  }

  async teeHeartbeat(): Promise<TransactionSignature> {
    const queueKey = this.queueAccount.publicKey;
    const queueAccount = this.queueAccount;
    const queue = await this.queueAccount.loadData();
    const [permissionAccount, permissionBump] = PermissionAccount.fromSeed(
      this.program,
      queue.authority,
      queueKey,
      this.oracleAccount.publicKey
    );
    let gcOracle = queue.dataBuffer[queue.gcIdx];
    if (gcOracle === undefined || gcOracle.equals(PublicKey.default)) {
      gcOracle = this.oracleAccount.publicKey;
    }
    const oracleData = await this.oracleAccount.loadData();
    const env = SolanaEnvironment.getInstance();
    const payer = await env.loadKeypair();
    const oracleAuthorityKp = await env.loadAuthority();
    const quoteKp = QuoteAccount.keypairFromAssociated(
      oracleAuthorityKp.publicKey
    );
    const [stateAccount, stateBump] = ProgramStateAccount.fromSeed(
      this.program
    );

    const sig = await (this.oracleAccount.program as any)._program.methods
      .oracleTeeHeartbeat({ permissionBump })
      .accounts({
        oracle: this.oracleAccount.publicKey,
        oracleAuthority: oracleData.oracleAuthority,
        tokenAccount: oracleData.tokenAccount,
        oracleQueue: queueKey,
        queueAuthority: queue.authority,
        gcOracle,
        permission: permissionAccount.publicKey,
        dataBuffer: queue.dataBuffer,
        quote: quoteKp.publicKey,
        programState: stateAccount.publicKey,
      })
      .signers([payer, oracleAuthorityKp])
      .rpc();
    return sig;
  }

  public async sendSaveResult(
    aggregatorAccount: AggregatorAccount,
    aggregator: types.AggregatorAccountData,
    params: AggregatorSaveResultAsyncParams
  ): Promise<TransactionSignature> {
    const [_aggregatorAccount, accounts] = this.getAggregator(
      aggregatorAccount.publicKey
    );

    const priorityFee = AggregatorAccount.calculatePriorityFee(
      aggregator,
      this.solanaTime.toNumber()
    );

    const saveResultTxn = await aggregatorAccount.saveResultInstruction(
      this.oracleAccount.program.walletPubkey,
      {
        ...params,
        ...accounts,
        aggregator,
        queueAccount: this.queueAccount,
        queueAuthority: this.queueAuthority,
        oracleAccount: this.oracleAccount,
        oraclePermission: this.permissions,
        leaseEscrow: accounts.leaseEscrow,
      },
      {
        enableDurableNonce:
          SolanaEnvironment.getInstance().ENABLE_NONCE_SAVE_RESULT,
        computeUnitPrice: Math.max(priorityFee, 1),
        computeUnitLimit:
          SolanaEnvironment.getInstance().SOLANA_SAVE_RESULT_COMPUTE_UNITS,
        extraPriorityFee: params.extraPriorityFee,
      }
    );
    let signature = "";
    if (SolanaEnvironment.getInstance().ENABLE_NONCE_SAVE_RESULT) {
      const [_, NonceInformationWithContext] = await this.nextNonce();
      signature = await this.sendTransaction(
        saveResultTxn,
        undefined,
        NonceInformationWithContext
      );
    } else {
      signature = await this.sendTransaction(saveResultTxn);
    }

    // set last crank txn if metrics are enabled
    NodeMetrics.setLastTx();

    // TODO: Send aggregator ID, oraclePubkey, txn signature, and timestamp to metrics DB

    return signature;
  }

  public async sendVrf(
    vrfAccount: VrfAccount,
    vrf: types.VrfAccountData,
    idx: number,
    counter: anchor.BN,
    proof: string
  ): Promise<Array<TransactionSignature>> {
    if (this.queueSize) {
      try {
        return await this.sendVrfNonce(vrfAccount, vrf, idx, counter, proof);
      } catch (error) {
        NodeLogger.getInstance().debug(
          `VRF: Failed to send nonce transactions, falling back to using the blockhash, ${error}`,
          vrfAccount.publicKey.toBase58()
        );
      }
    }

    try {
      const signaturePromises = await this.sendVrfBlockhash(
        vrfAccount,
        vrf,
        idx,
        counter,
        proof
      );
      return signaturePromises;
    } catch (error) {
      NodeLogger.getInstance().info(
        `VRF: Failed to send nonce transactions, falling back to using the blockhash, ${error}`,
        vrfAccount.publicKey.toBase58()
      );

      throw error;
    }
  }

  private async sendVrfBlockhash(
    vrfAccount: VrfAccount,
    vrf: types.VrfAccountData,
    idx: number,
    counter: anchor.BN,
    proof: string
  ): Promise<Array<TransactionSignature>> {
    const txns = vrfAccount.proveAndVerifyInstructions(
      {
        vrf,
        proof,
        idx,
        counter,
        oraclePubkey: this.oracleAccount.publicKey,
        oracleTokenWallet: this.tokenWallet,
        oracleAuthority: this.program.walletPubkey,
      },
      {
        computeUnitLimit: 1_400_000,
        computeUnitPrice:
          SolanaEnvironment.getInstance().SOLANA_COMPUTE_UNIT_PRICE ?? 1,
      },
      60
    );

    const signaturePromises: Array<Promise<TransactionSignature>> = [];
    for await (const txn of [...txns]) {
      signaturePromises.push(this.sendTransaction(txn));
    }

    NodeLogger.getInstance().info(
      `VRF (Blockhash): proveAndVerify packed into ${txns.length} txns`,
      vrfAccount.publicKey.toBase58()
    );

    const signatures = await Promise.all(signaturePromises);
    return signatures;
  }

  private async sendVrfNonce(
    vrfAccount: VrfAccount,
    vrf: types.VrfAccountData,
    idx: number,
    counter: anchor.BN,
    proof: string
  ): Promise<Array<TransactionSignature>> {
    const nonceAccounts = await this.nextNonceBatch(40);
    if (nonceAccounts.length !== 40) {
      throw new Error(`Failed to fetch enough nonce accounts`);
    }

    const txns = vrfAccount.proveAndVerifyInstructions(
      {
        vrf,
        proof,
        idx,
        counter,
        oraclePubkey: this.oracleAccount.publicKey,
        oracleTokenWallet: this.tokenWallet,
        oracleAuthority: this.program.walletPubkey,
      },
      {
        enableDurableNonce: true,
        computeUnitLimit: 1_400_000,
        computeUnitPrice:
          SolanaEnvironment.getInstance().SOLANA_COMPUTE_UNIT_PRICE ?? 1,
      },
      60
    );

    const signaturePromises: Array<Promise<TransactionSignature>> = [];
    for await (const [i, txn] of [...txns].entries()) {
      const [nonce, nonceInfo] =
        i < nonceAccounts.length ? nonceAccounts[i] : await this.nextNonce();
      signaturePromises.push(this.sendTransaction(txn, undefined, nonceInfo));
    }

    NodeLogger.getInstance().debug(
      `VRF (Nonce): proveAndVerify packed into ${txns.length} txns`,
      vrfAccount.publicKey.toBase58()
    );

    const signatures = await Promise.all(signaturePromises);
    return signatures;
  }

  public async sendVrfLite(
    vrfLiteAccount: VrfLiteAccount,
    vrfLite: types.VrfLiteAccountData,
    idx: number,
    counter: anchor.BN,
    proof: string
  ): Promise<Array<TransactionSignature>> {
    if (this.queueSize) {
      try {
        return await this.sendVrfLiteNonce(
          vrfLiteAccount,
          vrfLite,
          idx,
          counter,
          proof
        );
      } catch (error) {
        NodeLogger.getInstance().debug(
          `VRF: Failed to send nonce transactions, falling back to using the blockhash, ${error}`,
          vrfLiteAccount.publicKey.toBase58()
        );
      }
    }

    try {
      const signaturePromises = await this.sendVrfLiteBlockhash(
        vrfLiteAccount,
        vrfLite,
        idx,
        counter,
        proof
      );
      return signaturePromises;
    } catch (error) {
      NodeLogger.getInstance().info(
        `VRF: Failed to send nonce transactions, falling back to using the blockhash, ${error}`,
        vrfLiteAccount.publicKey.toBase58()
      );

      throw error;
    }
  }

  private async sendVrfLiteBlockhash(
    vrfLiteAccount: VrfLiteAccount,
    vrfLite: types.VrfLiteAccountData,
    idx: number,
    counter: anchor.BN,
    proof: string
  ): Promise<Array<TransactionSignature>> {
    const txns = vrfLiteAccount.proveAndVerifyInstructions(
      {
        vrfLite,
        proof,
        counter,
        oraclePubkey: this.oracleAccount.publicKey,
        oracleTokenWallet: this.tokenWallet,
        oracleAuthority: this.program.walletPubkey,
      },
      {
        computeUnitLimit: 1_400_000,
        // computeUnitPrice:
        //   SolanaEnvironment.getInstance().SOLANA_COMPUTE_UNIT_PRICE ?? 1,
      },
      60
    );

    const signaturePromises: Array<Promise<TransactionSignature>> = [];
    for await (const txn of [...txns]) {
      signaturePromises.push(this.sendTransaction(txn));
    }

    NodeLogger.getInstance().info(
      `VRF (Blockhash): proveAndVerify packed into ${txns.length} txns`,
      vrfLiteAccount.publicKey.toBase58()
    );

    const signatures = await Promise.all(signaturePromises);
    return signatures;
  }

  private async sendVrfLiteNonce(
    vrfLiteAccount: VrfLiteAccount,
    vrfLite: types.VrfLiteAccountData,
    idx: number,
    counter: anchor.BN,
    proof: string
  ): Promise<Array<TransactionSignature>> {
    const nonceAccounts = await this.nextNonceBatch(40);
    if (nonceAccounts.length !== 40) {
      throw new Error(`Failed to fetch enough nonce accounts`);
    }

    const txns = vrfLiteAccount.proveAndVerifyInstructions(
      {
        vrfLite,
        proof,
        counter,
        oraclePubkey: this.oracleAccount.publicKey,
        oracleTokenWallet: this.tokenWallet,
        oracleAuthority: this.program.walletPubkey,
      },
      {
        enableDurableNonce: true,
        computeUnitLimit: 1_400_000,
        // computeUnitPrice:
        //   SolanaEnvironment.getInstance().SOLANA_COMPUTE_UNIT_PRICE ?? 1,
      },
      60
    );

    const signaturePromises: Array<Promise<TransactionSignature>> = [];
    for await (const [i, txn] of [...txns].entries()) {
      const [nonce, nonceInfo] =
        i < nonceAccounts.length ? nonceAccounts[i] : await this.nextNonce();
      signaturePromises.push(this.sendTransaction(txn, undefined, nonceInfo));
    }

    NodeLogger.getInstance().debug(
      `VRF (Nonce): proveAndVerify packed into ${txns.length} txns`,
      vrfLiteAccount.publicKey.toBase58()
    );

    const signatures = await Promise.all(signaturePromises);
    return signatures;
  }

  public async sendBufferSaveResult(
    bufferRelayerAccount: BufferRelayerAccount,
    params: BufferRelayerSaveResultSyncParams
  ): Promise<TransactionSignature> {
    const saveResultTxn = bufferRelayerAccount.saveResultSyncInstructions(
      this.payer.publicKey,
      params,
      {
        enableDurableNonce: true,
        computeUnitPrice:
          SolanaEnvironment.getInstance().SOLANA_COMPUTE_UNIT_PRICE ?? 1,
      }
    );
    const signature = await this.sendTransaction(saveResultTxn);
    return signature;
  }
}
