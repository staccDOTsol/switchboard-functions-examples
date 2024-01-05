import "mocha";
var assert = require("assert");
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import * as spl from "@solana/spl-token";

export class PermissionAccount {
  constructor(
    readonly program: anchor.Program,
    readonly publicKey: PublicKey
  ) {}

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
    program: anchor.Program,
    authority: PublicKey,
    granter: PublicKey,
    grantee: PublicKey
  ): [PermissionAccount, number] {
    const [publicKey, bump] = anchor.web3.PublicKey.findProgramAddressSync(
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
    program: anchor.Program,
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
  constructor(
    readonly program: anchor.Program,
    readonly publicKey: PublicKey
  ) {}

  public async loadData(): Promise<any> {
    const data = await this.program.account.nodeAccountData.fetch(
      this.publicKey
    );
    if (data === null) throw new Error("NodeAccountNotFound");
    return data;
  }

  public static async create(
    program: anchor.Program,
    params: {
      authority: PublicKey;
      queue: PublicKey;
    }
  ): Promise<[NodeAccount, Keypair, Transaction]> {
    const kp = Keypair.generate();
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
  constructor(
    readonly program: anchor.Program,
    readonly publicKey: PublicKey
  ) {}

  public async loadData(): Promise<any> {
    const data = await this.program.account.serviceQueueAccountData.fetch(
      this.publicKey
    );
    if (data === null) throw new Error("ServiceQueueAccountNotFound");
    return data;
  }

  public static async create(
    program: anchor.Program,
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
        mr_enclave: [...params.mrEnclave.slice(0, 32)],
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
  constructor(
    readonly program: anchor.Program,
    readonly publicKey: PublicKey
  ) {}

  public async loadData(): Promise<any> {
    // const data = (await this.program.provider.connection.getAccountInfo(
    // this.publicKey
    // // { dataSlice: { length: 8329, offset: 0 } }
    // ))!.data;
    // const coder = new anchor.BorshAccountsCoder(this.program.idl);
    // console.log(data);
    // return coder.decode("QuoteAccountData", data);
    //
    const data = await this.program.account.quoteAccountData.fetch(
      this.publicKey!
    );
    if (data === null) throw new Error("QuoteAccountNotFound");
    return data;
  }

  public static async create(
    program: anchor.Program,
    params: {
      node: PublicKey;
      data: Buffer;
    }
  ): Promise<[QuoteAccount, Keypair, Transaction[]]> {
    if (params.data.length === 0) {
      throw new Error("QuoteDataEmptyError");
    }
    const kp = Keypair.generate();
    const nodeAccount = new NodeAccount(program, params.node);
    const node = await nodeAccount.loadData();
    const queueAccount = new QueueAccount(program, node.queue);
    const queue = await queueAccount.loadData();
    const vQueueAccount = new QueueAccount(program, queue.verifierQueue);
    const txs: Array<Transaction> = [];
    for (let i = 0; i < params.data.length; i += 512) {
      const tx = await program.methods
        .quoteInit({
          // TODO: double check its offset correct
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
          authority: node.authority,
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

  public async verify(params: { verifier: PublicKey }): Promise<Transaction> {
    const data = await this.loadData();
    const nodeAccount = new NodeAccount(this.program, data.node);
    const node = await nodeAccount.loadData();
    const tx = await this.program.methods
      .queueAddMrEnclave(params)
      .accounts({
        quote: this.publicKey,
        queue: data.queue,
        verifierQueue: data.verifierQueue,
        verifierNode: params.verifier,
        verifiee: data.node,
        authority: node.authority,
      })
      .transaction();
    return tx;
  }
}

async function sendTx(program: anchor.Program, tx, signers) {
  await sendAndConfirmTransaction(program.provider.connection, tx, signers);
}

const PERMIT_ORACLE_HEARTBEAT = 1 << 0;

describe("SAS Tests", () => {
  const provider = anchor.AnchorProvider.local();

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  // Program for the tests.
  const program = anchor.workspace.SwitchboardQuoteVerifier;

  const payerKeypair = Keypair.fromSecretKey(
    (program.provider.wallet as any).payer.secretKey
  );

  it("SAS a sss", async () => {
    const idl = await anchor.Program.fetchIdl(
      program.programId,
      program.provider
    );
    console.log("1");
    const [verifierQueueAccount, kp1, tx1] = await QueueAccount.create(
      program,
      {
        authority: payerKeypair.publicKey,
        allowAuthorityOverrideAfter: 60,
        requireAuthorityHeartbeatPermission: true,
        requireUsagePermissions: false,
        maxQuoteVerificationAge: 604800,
        reward: 0,
        nodeTimeout: 180,
      }
    );
    await sendTx(program, tx1, [payerKeypair, kp1]);
    const [queueAccount, kp4, tx8] = await QueueAccount.create(program, {
      verifierQueue: verifierQueueAccount.publicKey,
      authority: payerKeypair.publicKey,
      requireAuthorityHeartbeatPermission: true,
      requireUsagePermissions: false,
      maxQuoteVerificationAge: 604800,
      reward: 0,
      nodeTimeout: 180,
    });
    await sendTx(program, tx8, [payerKeypair, kp4]);
    const tx2 = await verifierQueueAccount.addMrEnclave({
      mrEnclave: Buffer.from("123"),
    });
    await sendTx(program, tx2, [payerKeypair]);
    console.log(await verifierQueueAccount.loadData());
    // const tx3 = await queueAccount.removeMrEnclave({
    // mrEnclave: Buffer.from("123"),
    // });
    // await sendTx(program, tx3, [payerKeypair]);
    const [vnodeAccount, vkp, vtx] = await NodeAccount.create(program, {
      authority: payerKeypair.publicKey,
      queue: verifierQueueAccount.publicKey,
    });
    await sendTx(program, vtx, [payerKeypair, vkp]);

    const [vpermissionAccount, vtx2] = await PermissionAccount.create(program, {
      authority: payerKeypair.publicKey,
      granter: verifierQueueAccount.publicKey,
      grantee: vnodeAccount.publicKey,
    });
    await sendTx(program, vtx2, [payerKeypair]);
    const vtx3 = await vpermissionAccount.set({
      permission: PERMIT_ORACLE_HEARTBEAT,
      enable: true,
    });
    await sendTx(program, vtx3, [payerKeypair]);
    const [vquoteAccount, vkp2, vquoteTxs] = await QuoteAccount.create(
      program,
      {
        node: vnodeAccount.publicKey,
        data: Buffer.from("ABC"),
      }
    );
    assert(vquoteTxs.length !== 0);
    console.log(vquoteTxs.length);
    for (const quoteTx of vquoteTxs) {
      await sendTx(program, quoteTx, [payerKeypair, vkp2]);
      console.log("SENT");
    }
    console.log(await vquoteAccount.loadData());

    const vtx4 = await vnodeAccount.heartbeat({
      quote: vquoteAccount.publicKey,
    });
    await sendTx(program, vtx4, [payerKeypair]);

    const [nodeAccount, kp2, tx4] = await NodeAccount.create(program, {
      authority: payerKeypair.publicKey,
      queue: queueAccount.publicKey,
    });
    await sendTx(program, tx4, [payerKeypair, kp2]);

    const [permissionAccount, tx5] = await PermissionAccount.create(program, {
      authority: payerKeypair.publicKey,
      granter: queueAccount.publicKey,
      grantee: nodeAccount.publicKey,
    });
    await sendTx(program, tx5, [payerKeypair]);
    const tx6 = await permissionAccount.set({
      permission: PERMIT_ORACLE_HEARTBEAT,
      enable: true,
    });
    await sendTx(program, tx6, [payerKeypair]);

    const [quoteAccount, kp3, quoteTxs] = await QuoteAccount.create(program, {
      node: nodeAccount.publicKey,
      data: Buffer.from("ABC"),
    });
    for (const quoteTx of quoteTxs) {
      await sendTx(program, quoteTx, [payerKeypair, kp3]);
    }
    const tx7 = await nodeAccount.heartbeat({ quote: quoteAccount.publicKey });
    await sendTx(program, tx7, [payerKeypair]);

    // ===
  });
});
