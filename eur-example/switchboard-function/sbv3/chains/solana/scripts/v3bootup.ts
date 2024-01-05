const assert = require("assert");
import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import type { Transaction } from "@solana/web3.js";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  AttestationQueueAccount,
  FunctionAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import yargs = require("yargs/yargs");

const argv = yargs(process.argv).options({
  init: {
    type: "boolean",
    describe: "",
    demand: false,
    default: false,
  },
  addMrEnclave: {
    type: "boolean",
    describe: "",
    demand: false,
    default: false,
  },
  addMrEnclaveHex: {
    type: "boolean",
    describe: "",
    demand: false,
    default: false,
  },
  mrEnclave: {
    type: "string",
    describe: "",
    demand: false,
    default: null,
  },
  queue: {
    type: "string",
    describe: "",
    demand: false,
    default: null,
  },
}).argv as any;

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
    const [publicKey, bump] = anchor.utils.publicKey.findProgramAddressSync(
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
      .attestationPermissionInit({})
      .accounts({
        permission: account.publicKey,
        attestationQueue: params.granter,
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
        attestationQueue: data.granter,
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
        attestationQueue: params.queue,
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
        attestationQueue: queueKey,
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
    const data = await this.program.account.attestationQueueAccountData.fetch(
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
      .attestationQueueInit({
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
      .attestationQueueAddMrEnclave({
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
  constructor(
    readonly program: anchor.Program,
    readonly publicKey: PublicKey
  ) {}

  public async loadData(): Promise<any> {
    const data = await this.program.account.verifierAccountData.fetch(
      this.publicKey!
    );
    if (data === null) throw new Error("QuoteAccountNotFound");
    return data;
  }

  public static async create(
    program: anchor.Program,
    params: {
      verifierQueue: PublicKey;
    }
  ): Promise<[QuoteAccount, Keypair, Transaction]> {
    const kp = Keypair.generate();
    const vQueueAccount = new QueueAccount(program, params.verifierQueue);
    const queue = await vQueueAccount.loadData();
    const tx = await program.methods
      .verifierInit({})
      .accounts({
        verifier: kp.publicKey,
        attestationQueue: params.verifierQueue!,
        queueAuthority: queue.authority,
        authority: program.provider.publicKey,
        payer: program.provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    const account = new QuoteAccount(program, kp.publicKey);
    return [account, kp, tx];
  }

  public async verify(params: { verifier: PublicKey }): Promise<Transaction> {
    const data = await this.loadData();
    const nodeAccount = new NodeAccount(this.program, data.node);
    const node = await nodeAccount.loadData();
    const tx = await this.program.methods
      .attestationQueueAddMrEnclave(params)
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

  public async rotate(params: { newSigner: PublicKey }): Promise<Transaction> {
    const data = await this.loadData();
    const tx = await this.program.methods
      .verifierQuoteRotate(params)
      .accounts({
        verifier: this.publicKey!,
        authority: data.authority!,
        enclaveSigner: params.newSigner!,
        attestationQueue: data.attestationQueue!,
      })
      .transaction();
    return tx;
  }

  public async heartbeat(): Promise<Transaction> {
    const data = await this.loadData();
    const queueAccount = new QueueAccount(this.program, data.attestationQueue);
    const queueData = await queueAccount.loadData();
    const queueAuthority = queueData.authority!;
    let gcNode = queueData.data[queueData.gcIdx]!;
    if (gcNode.equals(PublicKey.default)) {
      gcNode = this.publicKey;
    }
    const [permission] = anchor.utils.publicKey.findProgramAddressSync(
      [
        Buffer.from("PermissionAccountData"),
        queueData.authority.toBytes(),
        queueAccount.publicKey.toBytes(),
        this.publicKey.toBytes(),
      ],
      this.program.programId
    );
    const tx = await this.program.methods
      .verifierHeartbeat({})
      .accounts({
        verifier: this.publicKey,
        securedSigner: data.securedSigner,
        attestationQueue: queueAccount.publicKey,
        queueAuthority,
        gcNode,
        permission,
      })
      .transaction();
    return tx;
  }
}

export class StateAccount {
  constructor(
    readonly program: anchor.Program,
    readonly publicKey: PublicKey
  ) {}

  public async loadData(): Promise<any> {
    const data = await this.program.account.stateData.fetch(this.publicKey!);
    if (data === null) throw new Error("StateNotFound");
    return data;
  }

  public static async create(
    program: anchor.Program
  ): Promise<[StateAccount, Transaction]> {
    const kp = Keypair.generate();
    const state = StateAccount.fromSeed(program)[0];
    const tx = await program.methods
      .stateInit({})
      .accounts({
        state: state.publicKey,
        payer: program.provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    return [state, tx];
  }

  public static fromSeed(program: anchor.Program): [StateAccount, number] {
    const [publicKey, bump] = anchor.utils.publicKey.findProgramAddressSync(
      [Buffer.from("STATE")],
      program.programId
    );
    return [new StateAccount(program, publicKey), bump];
  }
}

async function sendTx(program: anchor.Program, tx, signers) {
  return await sendAndConfirmTransaction(
    program.provider.connection,
    tx,
    signers
  );
}

const PERMIT_ORACLE_HEARTBEAT = 1 << 0;

(async function main() {
  let url =
    "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14";
  url = "https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a";
  const COMMITMENT = "confirmed";
  const connection = new Connection(url, {
    commitment: COMMITMENT,
  });
  const programId = new PublicKey(
    "sbattyXrzedoNATfc4L31wC9Mhxsi1BmFhTiN8gDshx"
  );
  const walletStr = require("fs").readFileSync(
    "/Users/mgild/switchboard_environments_v2/mainnet/upgrade_authority/upgrade_authority.json",
    "utf8"
  );
  const walletBuffer = new Uint8Array(JSON.parse(walletStr));
  const walletKeypair = Keypair.fromSecretKey(walletBuffer);
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
  const idl = await anchor.Program.fetchIdl(programId, provider);
  // console.log(JSON.stringify(idl, null, 2));
  // return;
  const program = new anchor.Program(idl!, programId, provider);
  const switchboard = await SwitchboardProgram.fromProvider(provider as any);

  const payerKeypair = walletKeypair;
  if (argv.init === true) {
    const [state, tx1] = await StateAccount.create(program);
    console.log(`State: ${state.publicKey.toString()}`);
    try {
      await sendTx(program, tx1, [payerKeypair]);
    } catch {}
    const [queueAccount, kp4, tx8] = await QueueAccount.create(program, {
      authority: payerKeypair.publicKey,
      requireAuthorityHeartbeatPermission: false,
      requireUsagePermissions: false,
      maxQuoteVerificationAge: 60 * 60 * 24 * 7,
      allowAuthorityOverrideAfter: 1,
      reward: 20_000,
      nodeTimeout: 180,
    });
    console.log(`Queue: ${queueAccount.publicKey.toString()}`);
    await sendTx(program, tx8, [payerKeypair, kp4]);
    // const queueAccount = new QueueAccount(program, new PublicKey(""));
    const functionKeypair = anchor.web3.Keypair.generate();
    const [functionAccount] = await FunctionAccount.create(switchboard, {
      name: "FUNCTION_NAME",
      metadata: "FUNCTION_METADATA",
      schedule: "30 * * * * *", // every 30 seconds
      container: "switchboardlabs/basic-oracle-function",
      version: "latest",
      mrEnclave: new Uint8Array(0),
      attestationQueue: new AttestationQueueAccount(
        switchboard,
        queueAccount.publicKey
      ),
      // keypair: functionKeypair,
    });
    console.log(`Function: ${functionAccount.publicKey.toString()}`);
    const [quoteAccount, kp6, tx10] = await QuoteAccount.create(program, {
      verifierQueue: queueAccount.publicKey,
    });
    console.log(`quote: ${quoteAccount.publicKey.toString()}`);
    await sendTx(program, tx10, [payerKeypair, kp6]);
    const [quoteAccount2, kp7, tx11] = await QuoteAccount.create(program, {
      verifierQueue: queueAccount.publicKey,
    });
    console.log(`quote: ${quoteAccount2.publicKey.toString()}`);
    await sendTx(program, tx11, [payerKeypair, kp7]);

    const [permissionAccount, permissionTx] = await PermissionAccount.create(
      program,
      {
        authority: payerKeypair.publicKey,
        granter: queueAccount.publicKey,
        grantee: quoteAccount.publicKey,
      }
    );
    console.log(`permission: ${permissionAccount.publicKey.toString()}`);
    await sendTx(program, permissionTx, [payerKeypair]);

    const securedKp = Keypair.generate();
    const rotateTx = await quoteAccount.rotate({
      newSigner: securedKp.publicKey,
    });
    const rotateSig = await sendTx(program, rotateTx, [payerKeypair]);
    console.log(`Rotate TX: ${rotateSig}`);
    const hbtx = await quoteAccount.heartbeat();
    const hbSig = await sendTx(program, hbtx, [payerKeypair, securedKp]);
    console.log(`Heartbeat TX: ${hbSig}`);
  }
  if (argv.addMrEnclave === true) {
    const verifierQueueAccount = new QueueAccount(
      program,
      new PublicKey(argv.queue)
    );
    const mrEnclave = argv.mrEnclave;
    const tx2 = await verifierQueueAccount.addMrEnclave({
      mrEnclave: Buffer.from(mrEnclave, "hex"),
    });
    await sendTx(program, tx2, [payerKeypair]);
    console.log(`Measurement ${mrEnclave} registered to queue ${argv.queue}`);
  }
  if (argv.addMrEnclaveHex === true) {
    const verifierQueueAccount = new QueueAccount(
      program,
      new PublicKey(argv.queue)
    );
    const mrEnclave = argv.mrEnclave;
    const tx2 = await verifierQueueAccount.addMrEnclave({
      mrEnclave: Buffer.from(mrEnclave, "hex"),
    });
    console.log(Buffer.from(mrEnclave, "hex").length);
    await sendTx(program, tx2, [payerKeypair]);
    console.log(`Measurement ${mrEnclave} registered to queue ${argv.queue}`);
  }
})();

async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  programId = spl.TOKEN_PROGRAM_ID,
  associatedTokenProgramId = spl.ASSOCIATED_TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  const [address] = await PublicKey.findProgramAddress(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId
  );
  return address;
}
