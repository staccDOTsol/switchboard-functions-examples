import { SolanaEnvironment } from "../../../env/SolanaEnvironment";

import type { Program } from "@coral-xyz/anchor";
import type { Transaction } from "@solana/web3.js";
import {
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import assert from "assert";
import { createHash } from "crypto";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PermissionAccount {
  constructor(readonly program: Program, readonly publicKey: PublicKey) {}

  public async loadData(): Promise<any> {
    const data = await this.program.account.permissionAccountData.fetch(
      this.publicKey
    );
    if (data === null) throw new Error("PermissionNotFound");
    return data;
  }

  /**
   * Loads a PermissionAccount from the expected PDA seed format.
   * @param program The Switchboard program for the current connection.
   * @param authority The authority pubkey to be incorporated into the account seed.
   * @param granter The granter pubkey to be incorporated into the account seed.
   * @param grantee The grantee pubkey to be incorporated into the account seed.
   * @return PermissionAccount and PDA bump.
   */
  public static fromSeed(
    program: Program,
    authority: PublicKey,
    granter: PublicKey,
    grantee: PublicKey
  ): [PermissionAccount, number] {
    const [publicKey, bump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("PermissionAccountData"),
        authority.toBytes(),
        granter.toBytes(),
        grantee.toBytes(),
      ],
      program.programId
    );
    return [new PermissionAccount(program, publicKey), bump];
  }

  public static async create(
    program: Program,
    params: {
      authority: PublicKey;
      granter: PublicKey;
      grantee: PublicKey;
    }
  ): Promise<[PermissionAccount, Transaction]> {
    const [account] = PermissionAccount.fromSeed(
      program,
      params.authority,
      params.granter,
      params.grantee
    );
    const tx = await program.methods
      .permissionInit({})
      .accounts({
        permission: account.publicKey,
        queue: params.granter,
        node: params.grantee,
        systemProgram: SystemProgram.programId,
        authority: params.authority,
        payer: program.provider.publicKey,
      })
      .transaction();
    return [account, tx];
  }

  public async set(params: {
    permission: number;
    enable: boolean;
  }): Promise<Transaction> {
    const data = await this.loadData();
    const tx = await this.program.methods
      .permissionSet(params)
      .accounts({
        permission: this.publicKey,
        authority: data.authority,
        queue: data.granter,
        node: data.grantee,
      })
      .transaction();
    return tx;
  }
}

export class NodeAccount {
  constructor(readonly program: Program, readonly publicKey: PublicKey) {}

  public async loadData(): Promise<any> {
    const data = await this.program.account.nodeAccountData.fetch(
      this.publicKey
    );
    if (data === null) throw new Error("NodeAccountNotFound");
    return data;
  }

  public static async create(
    program: Program,
    params: {
      authority: PublicKey;
      queue: PublicKey;
      keypairSeed?: Array<Buffer>;
    }
  ): Promise<[NodeAccount, Keypair, Transaction]> {
    let kp = Keypair.generate();
    if ((params.keypairSeed ?? null) !== null) {
      const hash = createHash("sha256");
      for (const x of params.keypairSeed!) {
        hash.update(x);
      }
      kp = Keypair.fromSeed(hash.digest());
    }
    const tx = await program.methods
      .nodeInit({})
      .accounts({
        node: kp.publicKey,
        authority: params.authority,
        queue: params.queue,
        payer: program.provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    const account = new NodeAccount(program, kp.publicKey);
    return [account, kp, tx];
  }

  public async heartbeat(params: { quote: PublicKey }): Promise<Transaction> {
    const data = await this.loadData();
    const queueKey = data.queue;
    const queueAccount = new QueueAccount(this.program, queueKey);
    const queue = await queueAccount.loadData();
    const [permissionAccount] = PermissionAccount.fromSeed(
      this.program,
      queue.authority,
      queueKey,
      this.publicKey
    );
    let gcNode = queue.data[queue.gcIdx];
    if (gcNode.equals(PublicKey.default)) {
      gcNode = this.publicKey;
    }
    const tx = await this.program.methods
      .nodeHeartbeat({})
      .accounts({
        node: this.publicKey,
        authority: data.authority,
        queue: queueKey,
        queueAuthority: queue.authority,
        quote: params.quote,
        gcNode,
        permission: permissionAccount.publicKey,
      })
      .transaction();
    return tx;
  }
}

export class QueueAccount {
  constructor(readonly program: Program, readonly publicKey: PublicKey) {}

  public async loadData(): Promise<any> {
    const data = await this.program.account.serviceQueueAccountData.fetch(
      this.publicKey
    );
    if (data === null) throw new Error("ServiceQueueAccountNotFound");
    return data;
  }

  public static async create(
    program: Program,
    params: {
      verifierQueue?: PublicKey;
      authority: PublicKey;
      allowAuthorityOverrideAfter?: number;
      requireAuthorityHeartbeatPermission: boolean;
      requireUsagePermissions?: boolean;
      maxQuoteVerificationAge: number;
      reward: number;
      nodeTimeout: number;
    }
  ): Promise<[QueueAccount, Keypair, Transaction]> {
    params.allowAuthorityOverrideAfter =
      params.allowAuthorityOverrideAfter ?? 0;
    params.requireUsagePermissions = params.requireUsagePermissions ?? false;
    const kp = Keypair.generate();
    if (params.verifierQueue === null) {
      params.verifierQueue = kp.publicKey;
    }
    const tx = await program.methods
      .queueInit({
        allowAuthorityOverrideAfter: params.allowAuthorityOverrideAfter,
        requireAuthorityHeartbeatPermission:
          params.requireAuthorityHeartbeatPermission,
        requireUsagePermissions: params.requireUsagePermissions,
        maxQuoteVerificationAge: params.maxQuoteVerificationAge,
        reward: params.reward,
        nodeTimeout: params.nodeTimeout,
      })
      .accounts({
        queue: kp.publicKey,
        authority: params.authority,
        payer: program.provider.publicKey,
        systemProgram: SystemProgram.programId,
        verifierQueue: params.verifierQueue ?? kp.publicKey,
      })
      .transaction();
    const account = new QueueAccount(program, kp.publicKey);
    return [account, kp, tx];
  }

  public async addMrEnclave(params: {
    mrEnclave: Buffer;
  }): Promise<Transaction> {
    const data = await this.loadData();
    const tx = await this.program.methods
      .queueAddMrEnclave({
        mrEnclave: [...params.mrEnclave.slice(0, 32)],
      })
      .accounts({
        queue: this.publicKey,
        queueAuthority: data.authority,
      })
      .transaction();
    return tx;
  }

  public async removeMrEnclave(params: {
    mrEnclave: Buffer;
  }): Promise<Transaction> {
    const data = await this.loadData();
    const queueKey = data.queue;
    const tx = await this.program.methods
      .queueRemoveMrEnclave({
        mr_enclave: [...params.mrEnclave.slice(0, 32)],
      })
      .accounts({
        queue: this.publicKey,
        queueAuthority: data.authority,
      })
      .transaction();
    return tx;
  }
}

export class QuoteAccount {
  constructor(readonly program: Program, readonly publicKey: PublicKey) {}

  public static keypairFromAssociated(seed: PublicKey): Keypair {
    const hash = createHash("sha256");
    hash.update(Buffer.from("QuoteAccountData"));
    hash.update(seed.toBuffer());
    const kp = Keypair.fromSeed(hash.digest());
    return kp;
  }

  public async loadData(): Promise<any> {
    const data = await this.program.account.quoteAccountData.fetch(
      this.publicKey!
    );
    if (data === null) throw new Error("QuoteAccountNotFound");
    return data;
  }

  public static async create(
    program: Program,
    params: {
      node: PublicKey;
      queue: PublicKey;
      authority: PublicKey;
      data: Buffer;
      keypairSeed?: Array<Buffer>;
    }
  ): Promise<[QuoteAccount, Keypair, Transaction[]]> {
    if (params.data.length === 0) {
      throw new Error("QuoteDataEmptyError");
    }
    let kp = Keypair.generate();
    if ((params.keypairSeed ?? null) !== null) {
      const hash = createHash("sha256");
      for (const x of params.keypairSeed!) {
        hash.update(x);
      }
      kp = Keypair.fromSeed(hash.digest());
    }
    const nodeAccount = new NodeAccount(program, params.node);
    const queueAccount = new QueueAccount(program, params.queue);
    const queue = await queueAccount.loadData();
    const vQueueAccount = new QueueAccount(program, queue.verifierQueue);
    const txs: Array<Transaction> = [];
    for (let i = 0; i < params.data.length; i += 512) {
      const tx = await program.methods
        .quoteInit({
          data: params.data.slice(i, Math.min(i + 512, params.data.length)),
          totalLen: params.data.length,
          chunkStart: i,
          chunkEnd: Math.min(i + 512, params.data.length),
        })
        .accounts({
          quote: kp.publicKey,
          queue: queueAccount.publicKey,
          verifierQueue: queue.verifierQueue,
          node: nodeAccount.publicKey,
          authority: params.authority,
          queueAuthority: queue.authority,
          payer: program.provider.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      txs.push(tx);
    }
    assert(txs.length !== 0);
    const account = new QuoteAccount(program, kp.publicKey);
    return [account, kp, txs];
  }

  public static async createSimple(
    program: Program,
    params: {
      verifierQueue: PublicKey;
      authority: PublicKey;
      data: Buffer;
      keypairSeed?: Array<Buffer>;
    }
  ): Promise<[QuoteAccount, Keypair, Transaction[]]> {
    if (params.data.length === 0) {
      throw new Error("QuoteDataEmptyError");
    }
    let kp = Keypair.generate();
    if ((params.keypairSeed ?? null) !== null) {
      const hash = createHash("sha256");
      for (const x of params.keypairSeed!) {
        hash.update(x);
      }
      kp = Keypair.fromSeed(hash.digest());
    }
    const vQueueAccount = new QueueAccount(program, params.verifierQueue);
    const txs: Array<Transaction> = [];
    for (let i = 0; i < params.data.length; i += 512) {
      const tx = await program.methods
        .quoteInitSimple({
          data: params.data.slice(i, Math.min(i + 512, params.data.length)),
          totalLen: params.data.length,
          chunkStart: i,
          chunkEnd: Math.min(i + 512, params.data.length),
        })
        .accounts({
          quote: kp.publicKey,
          verifierQueue: params.verifierQueue,
          authority: params.authority,
          payer: program.provider.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      txs.push(tx);
    }
    assert(txs.length !== 0);
    const account = new QuoteAccount(program, kp.publicKey);
    return [account, kp, txs];
  }

  // public async verify(params: { verifier: PublicKey }): Promise<Transaction> {
  // const data = await this.loadData();
  // const nodeAccount = new NodeAccount(this.program, data.node);
  // const node = await nodeAccount.loadData();
  // const tx = await this.program.methods
  // .queueAddMrEnclave(params)
  // .accounts({
  // quote: this.publicKey,
  // queue: data.queue,
  // verifierQueue: data.verifierQueue,
  // verifierNode: params.verifier,
  // verifiee: data.node,
  // authority: node.authority,
  // })
  // .transaction();
  // return tx;
  // }
}

export async function initializeAndPollForVerification(
  program: Program,
  params: { verifierQueue: PublicKey; quoteData: Buffer }
): Promise<QuoteAccount> {
  const env = SolanaEnvironment.getInstance();
  const payer = await env.loadKeypair();
  const authority = await env.loadAuthority();
  const [quoteAccount, quoteKp, quoteTxs] = await QuoteAccount.createSimple(
    program,
    {
      verifierQueue: params.verifierQueue,
      data: params.quoteData,
      authority: authority.publicKey,
      keypairSeed: [
        Buffer.from("QuoteAccountData"),
        authority.publicKey.toBuffer(),
      ],
    }
  );
  let sendQuoteTxs = false;
  try {
    const quote = await quoteAccount.loadData();
    const VERIFICATION_SUCCESS = 1 << 2;
    if (quote.verificationStatus !== VERIFICATION_SUCCESS) {
      sendQuoteTxs = true;
    }
  } catch {
    sendQuoteTxs = true;
  }
  if (sendQuoteTxs) {
    for (const tx of quoteTxs) {
      console.log(await sendTx(program, tx, [payer, authority, quoteKp]));
    }
  }
  let continuePoll = true;
  while (continuePoll) {
    try {
      const quote = await quoteAccount.loadData();
      console.log(quote);
      const VERIFICATION_SUCCESS = 1 << 2;
      if (quote.verificationStatus !== VERIFICATION_SUCCESS) {
        console.log("Oracle quote is still pending verification");
        await delay(2000);
      } else {
        console.log("Oracle SGX measurement has been verified");
        continuePoll = false;
      }
    } catch {
      console.log("Quote load failure");
    }
  }
  return quoteAccount;
}

export async function sendTx(program: Program, tx, signers): Promise<string> {
  return await sendAndConfirmTransaction(
    program.provider.connection,
    tx,
    signers
  );
}

const PERMIT_ORACLE_HEARTBEAT = 1 << 0;
