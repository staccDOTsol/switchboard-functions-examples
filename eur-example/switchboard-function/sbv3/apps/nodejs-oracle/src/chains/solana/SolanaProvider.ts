import { SolanaEnvironment } from "../../env/SolanaEnvironment";
import { NodeMetrics } from "../../modules/metrics";

import type {
  NonceAccountWithContext,
  NonceInformationWithContext,
} from "./nonce";
import { Nonce } from "./nonce";
import { DEFAULT_COMMITMENT } from "./types";

import * as anchor from "@coral-xyz/anchor";
import TTLCache from "@isaacs/ttlcache";
import type {
  AccountChangeCallback,
  AccountInfo,
  BlockhashWithExpiryBlockHeight,
  Commitment,
  TransactionSignature,
} from "@solana/web3.js";
import {
  Connection,
  Keypair,
  NONCE_ACCOUNT_LENGTH,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import { bs58 } from "@switchboard-xyz/common";
import {
  extractBooleanEnvVar,
  extractIntegerEnvVar,
  extractStringEnvVars,
} from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type {
  QueueAccount,
  SwitchboardAccount,
} from "@switchboard-xyz/solana.js";
import { SolanaClock, TransactionObject } from "@switchboard-xyz/solana.js";
import _ from "lodash";
import { fetch } from "undici";

export class SolanaProvider {
  // we can implement common fail over logic / load balancing instead
  private _connections: Array<Connection>;
  private _connectionIdx = 0;

  nonceIdx: number = 0;
  nonceCache: TTLCache<string, string>;

  accountSubscriptions: Array<AccountChangeCallback> = [];
  _accountSubscriptionMap: Map<string, number> = new Map();

  // _solanaTimeCache = new TTLCache<number, number>({
  //   max: 15000, // cache 15k timestamps
  //   ttl: 10 * 60 * 1000, // 10mins
  // });

  constructor(
    readonly queueAccount: QueueAccount,
    readonly queueAuthority: PublicKey,
    readonly nonceAccounts: Nonce[]
  ) {
    this.nonceCache = new TTLCache({
      max: this.nonceAccounts.length || 1,
      ttl: (extractIntegerEnvVar("NONCE_QUEUE_TIMEOUT", 60) ?? 60) * 1000,
    });

    // build connections array
    this._connections = [this.queueAccount.program.provider.connection];
    const backupUrl = extractStringEnvVars(
      "BACKUP_RPC_URL",
      "SOLANA_BACKUP_RPC_URL"
    );
    if (backupUrl) {
      this._connections.push(
        new Connection(backupUrl, { commitment: DEFAULT_COMMITMENT })
      );
    }
    for (const n of Array.from({ length: 10 }, (_, i) => i + 1)) {
      const key = `BACKUP_RPC_URL_${n}`;
      const backupUrlN = extractStringEnvVars(key, `SOLANA_${key}`);
      if (backupUrlN) {
        NodeLogger.getInstance().env(key, backupUrlN);
        this._connections.push(
          new Connection(backupUrlN, { commitment: "processed" })
        );
      }
    }

    this._blockhash = this.fetchRestBlockhash(
      queueAccount.program.connection.rpcEndpoint
    ).catch();
  }

  get payer(): Keypair {
    return Keypair.fromSecretKey(this.program.wallet.payer.secretKey);
  }

  get queueSize(): number {
    return this.nonceAccounts.length;
  }

  get nonceEnabled(): boolean {
    return this.queueSize > 0;
  }

  get program() {
    return this.queueAccount.program;
  }

  /** Return the next connection */
  public get nextConnection(): Connection {
    this._connectionIdx = (this._connectionIdx + 1) % this._connections.length;
    return this.connection;
  }
  /** Return the current connection */
  public get connection(): Connection {
    const idx = this._connectionIdx;
    return idx >= this._connections.length
      ? this._connections[0]
      : this._connections[idx];
  }
  /** Return the default connection, should be used for all reads */
  public get defaultConnection(): Connection {
    return this._connections[0];
  }

  private _blockhash?: Promise<Readonly<BlockhashWithExpiryBlockHeight>>;
  private _lastBlockhashFetch: number = 0;
  private _pendingBlockhash: Promise<Readonly<BlockhashWithExpiryBlockHeight>> =
    Promise.resolve({
      blockhash: PublicKey.default.toBase58(),
      lastValidBlockHeight: 0,
    });
  private _lastPendingBlockhashFetch: number = 0;

  get blockhash(): Promise<BlockhashWithExpiryBlockHeight> {
    const now = Date.now();
    if (
      this._lastPendingBlockhashFetch === 0 ||
      this._lastPendingBlockhashFetch <
        now - SolanaEnvironment.getInstance().SOLANA_BLOCKHASH_REFRESH_RATE
    ) {
      this.refreshBlockhash(now);
    }

    // return the pending promise if blockhash is null or 5s staleness
    if (
      !this._blockhash ||
      Date.now() - this._lastBlockhashFetch >
        Math.min(
          7500,
          10 * SolanaEnvironment.getInstance().SOLANA_BLOCKHASH_REFRESH_RATE
        )
    ) {
      return this._pendingBlockhash;
    }

    return this._blockhash;
  }

  refreshBlockhash(now = Date.now()) {
    this._lastPendingBlockhashFetch = now;
    if (extractBooleanEnvVar("SOLANA_CONNECTION_BLOCKHASH")) {
      this._pendingBlockhash = this.fetchBlockhash();
    } else {
      this._pendingBlockhash = this.fetchRestBlockhash();
    }

    // only set this blockhash when it is ready
    // can use stale blockhash
    this._pendingBlockhash
      .then((blockhash) => {
        this._blockhash = Promise.resolve(blockhash);
        this._lastBlockhashFetch = this._lastPendingBlockhashFetch;
        return blockhash;
      })
      .catch((error) => {
        NodeLogger.getInstance().error(`Failed to fetch blockhash: ${error}`);
      });
  }

  private _solanaTimeLastFetch = 0;
  private _solanaTimeOffset = 0;

  /** If SolanaClock is stale, resubscribe and return current wall clock time */
  get solanaTime(): anchor.BN {
    const now = Date.now();
    if (now - this._solanaTimeLastFetch > 1000) {
      this._solanaTimeLastFetch = now;
      this.fetchRestSolanaClock(this.defaultConnection.rpcEndpoint)
        .then((unixTimestamp) => {
          this._solanaTimeOffset =
            Math.round(now / 1000) - unixTimestamp.toNumber();
        })
        .catch((error) => {
          NodeLogger.getInstance().error(
            `Failed to fetch Solana clock: ${error}`,
            "SolanaClock"
          );
          this._solanaTimeOffset = 0; // dont want to interrupt normal flow
        });
    }
    return new anchor.BN(
      Math.round((Date.now() + this._solanaTimeOffset) / 1000)
    );
  }

  addSubscription(
    publicKey: PublicKey,
    callback: AccountChangeCallback,
    commitment: Commitment = "confirmed"
  ): number {
    if (this._accountSubscriptionMap.has(publicKey.toBase58())) {
      return this._accountSubscriptionMap.get(publicKey.toBase58())!;
    }

    this.accountSubscriptions.push(callback);
    const ws = this.defaultConnection.onAccountChange(
      publicKey,
      callback,
      commitment
    );
    this._accountSubscriptionMap.set(publicKey.toBase58(), ws);
    return ws;
  }

  private async fetchBlockhash(
    connection = this.defaultConnection
  ): Promise<BlockhashWithExpiryBlockHeight> {
    const response = await connection.getLatestBlockhash();
    return response;
  }

  async sendConnectionTransaction(
    serializedTx: Uint8Array | Buffer | Array<number>,
    connection = this.defaultConnection,
    skipPreFlight = true
  ): Promise<TransactionSignature> {
    const signature = await connection.sendRawTransaction(serializedTx, {
      skipPreflight: skipPreFlight,
      maxRetries: 10,
    });
    return signature;
  }

  public async sendRestTransaction(
    serializedTx: Uint8Array | Buffer | Array<number>,
    rpcEndpoint = this.defaultConnection.rpcEndpoint,
    retries = 20,
    skipPreFlight = true
  ): Promise<TransactionSignature> {
    let err = null;
    for (let i = 0; i < retries; ++i) {
      try {
        const res = await fetch(rpcEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Math.round(Math.random() * 1_000_000),
            method: "sendTransaction",
            params: [
              serializedTx!.toString("base64"),
              {
                skipPreflight: skipPreFlight,
                encoding: "base64",
                maxRetries: 6,
              },
            ],
          }),
        });
        return ((await res.json()) as any)!.result!;
      } catch (e: any) {
        err = e;
      }
    }
    throw err;
  }

  async sendTransaction(
    txn: TransactionObject,
    connection = this.defaultConnection,
    nonce?: NonceInformationWithContext,
    confirm = false
  ): Promise<TransactionSignature> {
    if (nonce) {
      const signature = await this.sendNonceTransaction(
        txn,
        nonce,
        connection,
        confirm
      );
      return signature;
    } else {
      const signature = await this.sendBlockhashTransaction(
        txn,
        connection,
        confirm
      );
      return signature;
    }
  }

  private async sendBlockhashTransaction(
    txn: TransactionObject,
    connection = this.defaultConnection,
    confirm = false
  ): Promise<TransactionSignature> {
    const blockhash = await connection.getLatestBlockhash("finalized");
    const tx = txn.toTxn(blockhash);
    tx.sign(this.payer, ...txn.signers);

    const signature = SolanaEnvironment.getInstance()
      .SOLANA_DISABLE_REST_CONNECTION
      ? await this.sendConnectionTransaction(tx.serialize(), connection)
      : await this.sendRestTransaction(tx.serialize(), connection.rpcEndpoint);

    if (confirm) {
      await connection.confirmTransaction({
        signature,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
        blockhash: blockhash.blockhash,
      });
      return signature;
    }

    return signature;
  }

  private async sendNonceTransaction(
    txn: TransactionObject,
    nonce: NonceInformationWithContext,
    connection = this.defaultConnection,
    confirm = false
  ): Promise<TransactionSignature> {
    const txnWithNonce = new TransactionObject(
      txn.payer,
      [nonce.nonceInstruction, ...txn.ixns],
      txn.signers,
      {
        enableDurableNonce: false, // this flag is only used to reserve space for nonceIxn
        computeUnitLimit: txn.computeUnitLimit,
        computeUnitPrice: txn.computeUnitPrice,
      }
    );
    const tx = txnWithNonce.toTxn({
      nonceInfo: nonce,
      minContextSlot: nonce.minContextSlot,
    });
    tx.sign(this.payer, ...txnWithNonce.signers);

    const signature = SolanaEnvironment.getInstance()
      .SOLANA_DISABLE_REST_CONNECTION
      ? await this.sendConnectionTransaction(tx.serialize(), connection)
      : await this.sendRestTransaction(tx.serialize(), connection.rpcEndpoint);

    if (confirm) {
      await connection.confirmTransaction({
        signature,
        minContextSlot: nonce.minContextSlot,
        nonceValue: nonce.nonce,
        nonceAccountPubkey: nonce.nonceInstruction.keys[0].pubkey,
      });
      return signature;
    }

    return signature;
  }

  private next(): Nonce {
    if (this.nonceAccounts.length === 0) {
      throw new Error(`No nonce accounts available.`);
    }
    this.nonceIdx = (this.nonceIdx + 1) % this.queueSize;
    return this.nonceAccounts[this.nonceIdx];
  }

  private async checkNonce(
    nonce: Nonce,
    nonceInformation: NonceInformationWithContext
  ): Promise<[Nonce, NonceInformationWithContext]> {
    const nonceCache = this.nonceCache.get(nonce.publicKey.toBase58());

    // cache empty
    if (!nonceCache || nonceCache !== nonceInformation.nonce) {
      this.nonceCache.set(nonce.publicKey.toBase58(), nonceInformation.nonce);
      return [nonce, nonceInformation];
    }

    NodeMetrics.getInstance()?.nonceFailure(nonce.publicKey.toString());

    // TODO: better error message, can we infer last usage from TTLCache?
    throw new Error(
      `NONCE: Nonce account not ready, last used ${
        Math.floor(Date.now() - 0) / 1000
      }s ago, ${nonce.publicKey}`
    );
  }

  // TODO: Only increment the nonceIdx if ALL nonce accounts were returned
  async nextNonceBatch(
    batchSize: number,
    retryCount = 1
  ): Promise<Array<[Nonce, NonceInformationWithContext]>> {
    const nonceAccounts = Array.from(Array(batchSize).keys()).map((n) =>
      this.next()
    );
    const noncePubkeys = nonceAccounts.map((n) => n.publicKey);
    const nonceAccountInfos: Array<{
      context: anchor.web3.Context;
      publicKey: anchor.web3.PublicKey;
      account: anchor.web3.AccountInfo<Buffer>;
    }> = (
      await anchor.utils.rpc.getMultipleAccountsAndContext(
        this.defaultConnection,
        noncePubkeys
      )
    ).filter(
      (
        r
      ): r is {
        context: anchor.web3.Context;
        publicKey: anchor.web3.PublicKey;
        account: anchor.web3.AccountInfo<Buffer>;
      } => r !== null
    );

    const nonces: Array<[Nonce, NonceInformationWithContext]> = [];
    for (const [
      i,
      { context, publicKey, account },
    ] of nonceAccountInfos.entries()) {
      try {
        if (!account) {
          throw new Error(`failed to fetch nonceAccountInfo ${publicKey}`);
        }

        const nonceAccount: NonceAccountWithContext = Nonce.decodeAcct(
          account,
          context.slot
        );

        const _nonce = nonceAccounts[i];
        if (!_nonce) {
          throw new Error(`Failed to fetch nonce`);
        }

        const nonceInfo = await _nonce.loadNonceInfo(nonceAccount);
        const [nonce, nonceInformation] = await this.checkNonce(
          _nonce,
          nonceInfo
        );
        nonces.push([nonce, nonceInformation]);
      } catch (error) {
        NodeLogger.getInstance().debug(`NonceFetchError: ${error}`);
      }
    }

    if (retryCount > 0 && nonces.length !== batchSize) {
      try {
        const missingBatch = await this.nextNonceBatch(
          Math.abs(batchSize - nonces.length),
          --retryCount
        );
        nonces.push(...missingBatch);
      } catch {}
    }

    return nonces;
  }

  /** Iterates through the queue and finds the next available valid nonce */
  async nextNonce(): Promise<[Nonce, NonceInformationWithContext]> {
    const nonce = this.next();
    const nonceInfo = await nonce.loadNonceInfo();

    try {
      const [Nonce, nonceInformation] = await this.checkNonce(nonce, nonceInfo);
      return [Nonce, nonceInformation];
    } catch (error: any) {
      NodeLogger.getInstance().info(error.toString());
    }

    NodeMetrics.getInstance()?.nonceFailure(nonce.publicKey.toString());
    // fallback to blockhash
    throw new Error(`Failed to find a ready nonce account`);
  }

  static async loadNonceAccounts(
    account: SwitchboardAccount,
    queueSize: number
  ): Promise<Nonce[]> {
    if (queueSize === 0) {
      return [];
    }

    const connection = account.program.provider.connection;
    const payerKeypair = Keypair.fromSecretKey(
      account.program.wallet.payer.secretKey
    );

    const nonceRentExemption =
      await connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);

    const queueBaseSeeds: string[] = Array.from(Array(queueSize).keys()).map(
      (n) => `NonceQueue-${n.toString().padStart(5, "0")}`
    );

    const noncePubkeyWithSeeds: [PublicKey, string][] = queueBaseSeeds.map(
      (seed) => Nonce.getPubkeyFromSeed(account, payerKeypair, seed)
    );
    const noncePubkeys: PublicKey[] = noncePubkeyWithSeeds.map((n) => n[0]);

    const pubkeyChunks: PublicKey[][] = _.chunk(noncePubkeys, 100);
    const nonceAccountInfos = (
      await Promise.all(
        pubkeyChunks.map((chunk) => connection.getMultipleAccountsInfo(chunk))
      )
    ).flat();

    const nonceAccounts: Array<Nonce> = [];
    const createMissingAccountTxns: Array<TransactionObject> = [];
    for (const [i, accountInfo] of nonceAccountInfos.entries()) {
      try {
        if (!accountInfo) {
          throw new Error(`missing nonce account info`);
        }
        const nonceAccount = Nonce.decode(accountInfo);
        nonceAccounts.push(
          new Nonce(
            connection,
            payerKeypair,
            queueBaseSeeds[i],
            noncePubkeyWithSeeds[i][0]
          )
        );
      } catch {
        createMissingAccountTxns.push(
          new TransactionObject(
            payerKeypair.publicKey,
            Nonce.createNonceInstructions(
              account,
              payerKeypair,
              queueBaseSeeds[i],
              nonceRentExemption
            ),
            []
          )
        );
        nonceAccounts.push(
          new Nonce(
            connection,
            payerKeypair,
            queueBaseSeeds[i],
            noncePubkeyWithSeeds[i][0]
          )
        );
      }
    }

    if (createMissingAccountTxns.length) {
      NodeLogger.getInstance().info(
        `Missing ${createMissingAccountTxns.length} nonce accounts in nonce queue`,
        "Environment"
      );

      const blockhash = await connection.getLatestBlockhash();
      const packedTransactions = TransactionObject.pack(
        createMissingAccountTxns
      );

      try {
        const signatures = await account.program.signAndSendAll(
          packedTransactions,
          undefined,
          blockhash,
          1
        );
      } catch (error) {
        NodeLogger.getInstance().warn("Retrying nonce init...", "Environment");
        return await SolanaProvider.loadNonceAccounts(account, queueSize);
      }
    }

    NodeLogger.getInstance().info(
      `Loaded ${nonceAccounts.length} nonce accounts`,
      "Environment"
    );

    return nonceAccounts;
  }

  private async fetchRestBlockhash(
    rpcEndpoint = this.defaultConnection.rpcEndpoint,
    commitment: Commitment = DEFAULT_COMMITMENT,
    retryCount = 3
  ): Promise<BlockhashWithExpiryBlockHeight> {
    this._lastBlockhashFetch = Date.now();
    const rawResponse = await fetch(rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.round(Math.random() * 1_000_000),
        method: "getLatestBlockhash",
        params: [
          {
            commitment: commitment,
          },
        ],
      }),
    });
    if (!rawResponse.ok) {
      // We should resubmit the
      if (retryCount === 0) {
        throw new Error(`Failed to fetch latestBlockhash`);
      }
      return this.fetchRestBlockhash(rpcEndpoint, commitment, --retryCount);
    }
    const response: {
      jsonrpc: string;
      result: {
        context: { slot: number };
        value: {
          blockhash: string;
          lastValidBlockHeight: number;
        };
      };
      id: number;
    } = (await rawResponse.json()) as any;
    return response.result.value;
  }

  public async fetchRestAccountInfo(
    publicKey: PublicKey,
    rpcEndpoint = this.defaultConnection.rpcEndpoint,
    commitment: Commitment = DEFAULT_COMMITMENT,
    retryCount = 3
  ): Promise<AccountInfo<Buffer>> {
    const rawResponse = await fetch(rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.round(Math.random() * 1_000_000),
        method: "getAccountInfo",
        params: [
          publicKey,
          {
            commitment: commitment,
            encoding: "base64",
          },
        ],
      }),
    });
    if (!rawResponse.ok) {
      // We should resubmit the
      if (retryCount === 0) {
        throw new Error(`Failed to fetch AccountInfo ${publicKey}`);
      }
      return this.fetchRestAccountInfo(
        publicKey,
        rpcEndpoint,
        commitment,
        --retryCount
      );
    }
    const response: {
      jsonrpc: string;
      result: {
        context: { slot: number };
        value: {
          data: [string, "base64" | "base58"];
          executable: boolean;
          lamports: number;
          owner: string;
          rentEpoch: number;
          space: number;
        };
      };
      id: number;
    } = (await rawResponse.json()) as any;

    const dataBuffer =
      response.result.value.data[1] === "base58"
        ? Buffer.from(bs58.decode(response.result.value.data[0]))
        : Buffer.from(
            response.result.value.data[0],
            response.result.value.data[1] as any
          );

    return {
      executable: response.result.value.executable,
      owner: new PublicKey(response.result.value.owner),
      lamports: response.result.value.lamports,
      rentEpoch: response.result.value.rentEpoch,
      data: dataBuffer,
    };
  }

  public async fetchRestSolanaClock(
    rpcEndpoint = this.defaultConnection.rpcEndpoint,
    commitment: Commitment = DEFAULT_COMMITMENT
  ): Promise<anchor.BN> {
    const clockAccountInfo = await this.fetchRestAccountInfo(
      SYSVAR_CLOCK_PUBKEY,
      rpcEndpoint,
      commitment
    );
    const clock = SolanaClock.decode(clockAccountInfo.data);
    return clock.unixTimestamp;
  }

  public async fetchRestBlocktime(
    slot: number,
    rpcEndpoint = this.defaultConnection.rpcEndpoint,
    retryCount = 3
  ): Promise<number> {
    const rawResponse = await fetch(rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.round(Math.random() * 1_000_000),
        method: "getBlockTime",
        params: [slot],
      }),
    });
    if (!rawResponse.ok) {
      // We should resubmit the
      if (retryCount === 0) {
        throw new Error(`Failed to fetch block time`);
      }
      return this.fetchRestBlocktime(slot, rpcEndpoint, --retryCount);
    }
    const response: {
      jsonrpc: string;
      id: number;
      result: number;
    } = (await rawResponse.json()) as any;
    return response.result;
  }
}
