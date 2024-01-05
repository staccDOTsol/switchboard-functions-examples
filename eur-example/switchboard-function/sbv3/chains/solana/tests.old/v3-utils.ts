import type { SwitchboardAttestationProgram } from "../target/types/switchboard_attestation_program";

import * as anchor from "@coral-xyz/anchor";
import type { Account } from "@solana/spl-token";
import type { TransactionSignature } from "@solana/web3.js";
import { sleep } from "@switchboard-xyz/common";
import type {
  RawBuffer,
  SendTransactionObjectOptions,
  SwitchboardProgram,
  TransactionObjectOptions,
} from "@switchboard-xyz/solana.js";
import {
  AccountNotFoundError,
  AttestationPermissionAccount,
  AttestationQueueAccount,
  type BootstrappedAttestationQueue,
  EnclaveAccount,
  FunctionAccount,
  parseCronSchedule,
  parseMrEnclave,
  parseRawBuffer,
  SB_ATTESTATION_PID,
  TransactionObject,
} from "@switchboard-xyz/solana.js";
import assert from "assert";

export const DEFAULT_CREATOR_SEED: number[] = Array(32).fill(0);
export const verifierMrEnclave = parseMrEnclave("Quote Verifier MrEnclave");
export const registryKey = parseRawBuffer("", 64);

export const container = parseRawBuffer("MyContainer", 32);
export const containerRegistry = parseRawBuffer("docker", 32);

export const containerMrEnclave = parseMrEnclave(
  "This is my container enclave measurement."
);

export interface SwitchboardWalletTransferParams {
  funderTokenWallet?: anchor.web3.PublicKey; // defaults to payer tokenWallet
  funderAuthority?: anchor.web3.Keypair; // defaults to payer
  transferAmount?: number;
}

export interface SwitchboardWalletWrapParams {
  funderAuthority?: anchor.web3.Keypair; // defaults to payer
  wrapAmount?: number;
}

export type SwitchboardWalletDepositParams = SwitchboardWalletTransferParams &
  SwitchboardWalletWrapParams;

export interface SwitchboardWalletState {
  bump: number;
  initialized: number;
  mint: anchor.web3.PublicKey;
  attestationQueue: anchor.web3.PublicKey;
  authority: anchor.web3.PublicKey;
  name: Array<number>;
  resourceCount: number;
  withdrawAuthority: anchor.web3.PublicKey;
  tokenWallet: anchor.web3.PublicKey;
  resources: Array<anchor.web3.PublicKey>;
  resourcesMaxLen: number;
  ebuf: Array<number>;
}

export type SwitchboardWalletWithEscrow = SwitchboardWalletState & {
  tokenWalletAccount: Account;
};

export class SwitchboardWallet {
  private _tokenWallet: anchor.web3.PublicKey | undefined = undefined;

  constructor(
    readonly program: SwitchboardProgram,
    readonly publicKey: anchor.web3.PublicKey
  ) {}

  public get attestationProgram(): anchor.Program<SwitchboardAttestationProgram> {
    return (this.program as any)
      ._attestationProgram as anchor.Program<SwitchboardAttestationProgram>;
  }

  public get tokenWallet(): anchor.web3.PublicKey {
    if (!this._tokenWallet) {
      this._tokenWallet = this.program.mint.getAssociatedAddress(
        this.publicKey
      );
    }
    return this._tokenWallet!;
  }

  public async getBalance(): Promise<number> {
    const balance = await this.program.mint.fetchBalance(this.tokenWallet);
    if (balance === null) {
      throw new AccountNotFoundError(
        "SwitchboardWallet Escrow",
        this.tokenWallet
      );
    }
    return balance;
  }

  public async getBalanceBN(): Promise<anchor.BN> {
    const balance = await this.program.mint.fetchBalanceBN(this.tokenWallet);
    if (balance === null) {
      throw new AccountNotFoundError(
        "SwitchboardWallet Escrow",
        this.tokenWallet
      );
    }
    return balance;
  }

  public static async createInstruction(
    program: SwitchboardProgram,
    payer: anchor.web3.PublicKey,
    attestationQueue: anchor.web3.PublicKey,
    authority: anchor.web3.PublicKey,
    name: string | anchor.web3.PublicKey,
    maxLen?: number,
    options?: TransactionObjectOptions
  ): Promise<[SwitchboardWallet, TransactionObject]> {
    const nameSeed = SwitchboardWallet.parseName(name);

    const switchboardWallet = SwitchboardWallet.fromSeed(
      program,
      attestationQueue,
      authority,
      nameSeed
    );

    const walletInitIxn = await switchboardWallet.attestationProgram.methods
      .walletInit({
        name: Buffer.from(nameSeed),
        maxLen: maxLen ?? null,
      })
      .accounts({
        wallet: switchboardWallet.publicKey,
        tokenWallet: switchboardWallet.tokenWallet,
        mint: program.mint.address,
        authority: payer,
        attestationQueue: attestationQueue,
        payer: payer,
        state: program.attestationProgramState.publicKey,
      })
      .instruction();

    return [
      switchboardWallet,
      new TransactionObject(payer, [walletInitIxn], [], options),
    ];
  }

  public static async create(
    program: SwitchboardProgram,
    attestationQueue: anchor.web3.PublicKey,
    authority: anchor.web3.PublicKey,
    name: string | anchor.web3.PublicKey,
    maxLen?: number,
    options?: SendTransactionObjectOptions
  ): Promise<[SwitchboardWallet, TransactionSignature]> {
    const [account, transaction] = await SwitchboardWallet.createInstruction(
      program,
      program.walletPubkey,
      attestationQueue,
      authority,
      name,
      maxLen,
      options
    );
    const txnSignature = await program.signAndSend(transaction, options);
    return [account, txnSignature];
  }

  public static parseName(
    name: string | anchor.web3.PublicKey | Uint8Array
  ): Uint8Array {
    let nameSeed: Uint8Array;
    if (typeof name === "string") {
      nameSeed = new Uint8Array(Buffer.from(name, "utf-8")).slice(0, 32);
      // nameSeed = parseRawBuffer(name, 32);
    } else if (name instanceof Uint8Array) {
      nameSeed = name;
    } else {
      nameSeed = name.toBytes();
    }

    return parseRawBuffer(nameSeed, 32);
  }

  public static fromSeed(
    program: SwitchboardProgram,
    attestationQueue: anchor.web3.PublicKey,
    authority: anchor.web3.PublicKey,
    name: string | anchor.web3.PublicKey | Uint8Array
  ): SwitchboardWallet {
    const nameSeed = SwitchboardWallet.parseName(name);
    const walletPubkey = anchor.web3.PublicKey.findProgramAddressSync(
      [
        program.mint.address.toBytes(),
        attestationQueue.toBytes(),
        authority.toBytes(),
        nameSeed,
      ],
      SB_ATTESTATION_PID
    )[0];
    return new SwitchboardWallet(program, walletPubkey);
  }

  public async loadData(): Promise<SwitchboardWalletWithEscrow> {
    const data = await this.attestationProgram.account.switchboardWallet.fetch(
      this.publicKey
    );
    if (data === null) {
      throw new AccountNotFoundError("SwitchboardWallet", this.publicKey);
    }
    const tokenWallet = await this.program.mint.getAccount(this.tokenWallet);
    if (!tokenWallet) {
      throw new AccountNotFoundError("Wallet Escrow", this.tokenWallet);
    }

    return { ...data, tokenWalletAccount: tokenWallet };
  }

  public static async load(
    program: SwitchboardProgram,
    attestationQueue: anchor.web3.PublicKey,
    authority: anchor.web3.PublicKey,
    name: string | anchor.web3.PublicKey
  ): Promise<[SwitchboardWallet, SwitchboardWalletWithEscrow | undefined]> {
    const wallet = SwitchboardWallet.fromSeed(
      program,
      attestationQueue,
      authority,
      name
    );

    try {
      const walletState = await wallet.loadData();
      return [wallet, walletState];
    } catch {}
    return [wallet, undefined];
  }

  public async fundInstruction(
    params: SwitchboardWalletDepositParams,
    options?: TransactionObjectOptions
  ): Promise<TransactionObject> {
    const walletState = await this.loadData();

    let payer: anchor.web3.Keypair;

    if (params.funderAuthority) {
      payer = params.funderAuthority;
    } else {
      payer = this.program.wallet.payer;
    }

    let payerTokenWallet: anchor.web3.PublicKey;
    if (params.funderTokenWallet) {
      payerTokenWallet = params.funderTokenWallet;
    } else {
      payerTokenWallet = this.program.mint.getAssociatedAddress(
        payer.publicKey
      );
    }

    let transferAmount: anchor.BN | null = null;
    if (params.transferAmount) {
      transferAmount = this.program.mint.toTokenAmountBN(params.transferAmount);
    }

    let wrapAmount: anchor.BN | null = null;
    if (params.wrapAmount) {
      wrapAmount = this.program.mint.toTokenAmountBN(params.wrapAmount);
    }

    const ixn = await this.attestationProgram.methods
      .walletFund({
        transferAmount,
        wrapAmount,
      })
      .accounts({
        wallet: this.publicKey,
        tokenWallet: this.tokenWallet,
        mint: walletState.mint,
        authority: walletState.authority,
        attestationQueue: walletState.attestationQueue,
        funderWallet: payerTokenWallet,
        funder: payer.publicKey,
        state: this.program.attestationProgramState.publicKey,
      })
      .remainingAccounts(
        walletState.resources
          .filter((r) => !anchor.web3.PublicKey.default.equals(r))
          .map((r): anchor.web3.AccountMeta => {
            return {
              pubkey: r,
              isSigner: false,
              isWritable: true,
            };
          })
      )
      .instruction();

    return new TransactionObject(
      this.program.wallet.payer.publicKey,
      [ixn],
      [payer],
      options
    );
  }

  public async fund(
    params: SwitchboardWalletDepositParams,
    options?: SendTransactionObjectOptions
  ): Promise<TransactionSignature> {
    const transaction = await this.fundInstruction(params, options);
    const txnSignature = await this.program.signAndSend(transaction, options);
    return txnSignature;
  }

  public async wrapInstruction(
    amount: number,
    options?: TransactionObjectOptions
  ): Promise<TransactionObject> {
    const walletState = await this.loadData();

    const ixn = await this.attestationProgram.methods
      .walletFund({
        transferAmount: null,
        wrapAmount: this.program.mint.toTokenAmountBN(amount),
      })
      .accounts({
        wallet: this.publicKey,
        tokenWallet: this.tokenWallet,
        mint: walletState.mint,
        authority: walletState.authority,
        attestationQueue: walletState.attestationQueue,
        funderWallet: null,
        funder: this.program.walletPubkey,
        state: this.program.attestationProgramState.publicKey,
      })
      .instruction();

    return new TransactionObject(
      this.program.wallet.payer.publicKey,
      [ixn],
      [],
      options
    );
  }

  public async wrap(
    amount: number,
    options?: SendTransactionObjectOptions
  ): Promise<TransactionSignature> {
    const transaction = await this.wrapInstruction(amount, options);
    const txnSignature = await this.program.signAndSend(transaction, options);
    return txnSignature;
  }

  public async withdrawInstruction(
    amount: number,
    destinationWallet?: anchor.web3.PublicKey,
    options?: TransactionObjectOptions
  ): Promise<TransactionObject> {
    const walletState = await this.loadData();
    const destinationTokenWallet =
      destinationWallet ??
      (await this.program.mint.getOrCreateAssociatedUser(
        this.program.walletPubkey
      ));

    const ixn = await this.attestationProgram.methods
      .walletWithdraw({
        amount: this.program.mint.toTokenAmountBN(amount),
      })
      .accounts({
        wallet: this.publicKey,
        tokenWallet: this.tokenWallet,
        mint: walletState.mint,
        authority: walletState.authority,
        attestationQueue: walletState.attestationQueue,
        destinationWallet: destinationTokenWallet,
        state: this.program.attestationProgramState.publicKey,
      })
      .instruction();

    return new TransactionObject(
      this.program.wallet.payer.publicKey,
      [ixn],
      [],
      options
    );
  }

  public async withdraw(
    amount: number,
    destinationWallet?: anchor.web3.PublicKey,
    options?: SendTransactionObjectOptions
  ): Promise<TransactionSignature> {
    const transaction = await this.withdrawInstruction(
      amount,
      destinationWallet,
      options
    );
    const txnSignature = await this.program.signAndSend(transaction, options);
    return txnSignature;
  }
}

export async function createAttestationQueue(
  switchboardProgram: SwitchboardProgram
): Promise<BootstrappedAttestationQueue> {
  const program: anchor.Program<SwitchboardAttestationProgram> = (
    switchboardProgram as any
  )._attestationProgram;

  const payer = (program.provider as anchor.AnchorProvider).publicKey;

  const attesationQueueKeypair = anchor.web3.Keypair.generate();
  const verifierKeypair = anchor.web3.Keypair.generate();
  const verifierEnclaveSigner = anchor.web3.Keypair.generate();

  const signers: Array<anchor.web3.Keypair> = [
    attesationQueueKeypair,
    verifierKeypair,
    verifierEnclaveSigner,
  ];

  const ixns: Array<anchor.web3.TransactionInstruction> = [];

  const queueInitSignature = await program.methods
    .attestationQueueInit({
      reward: 0,
      allowAuthorityOverrideAfter: 300,
      maxQuoteVerificationAge: 604800,
      nodeTimeout: 180,
      requireAuthorityHeartbeatPermission: false,
      requireUsagePermissions: false,
    })
    .accounts({
      queue: attesationQueueKeypair.publicKey,
      authority: payer,
      payer: payer,
    })
    .signers([attesationQueueKeypair])
    .rpc();

  const addQueueEnclave = await program.methods
    .attestationQueueAddMrEnclave({ mrEnclave: Array.from(verifierMrEnclave) })
    .accounts({ queue: attesationQueueKeypair.publicKey, authority: payer })
    .rpc();

  // create quote verifier #1
  const quoteVerifierInit = await program.methods
    .quoteInit({ registryKey: Array.from(registryKey) })
    .accounts({
      quote: verifierKeypair.publicKey,
      attestationQueue: attesationQueueKeypair.publicKey,
      queueAuthority: payer,
      authority: payer,
      payer: payer,
    })
    .signers([verifierKeypair])
    .rpc();
  const permissionKey = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("PermissionAccountData"),
      payer.toBytes(),
      attesationQueueKeypair.publicKey.toBytes(),
      verifierKeypair.publicKey.toBytes(),
    ],
    program.programId
  )[0];
  const quotePermissionsInit = await program.methods
    .attestationPermissionInit({})
    .accounts({
      permission: permissionKey,
      attestationQueue: attesationQueueKeypair.publicKey,
      node: verifierKeypair.publicKey,
      authority: payer,
      payer: payer,
    })
    .rpc();
  const setPermissions = await program.methods
    .attestationPermissionSet({ permission: 1, enable: true })
    .accounts({
      permission: permissionKey,
      authority: payer,
      attestationQueue: attesationQueueKeypair.publicKey,
      enclave: verifierKeypair.publicKey,
    })
    .rpc();

  // set quote signer
  const setQuoteSigner = await program.methods
    .quoteRotate({ registryKey: Array.from(registryKey) })
    .accounts({
      quote: verifierKeypair.publicKey,
      authority: payer,
      enclaveSigner: verifierEnclaveSigner.publicKey,
      attestationQueue: attesationQueueKeypair.publicKey,
    })
    .rpc();

  const quoteHeartbeatSig = await program.methods
    .quoteHeartbeat({})
    .accounts({
      quote: verifierKeypair.publicKey,
      enclaveSigner: verifierEnclaveSigner.publicKey,
      attestationQueue: attesationQueueKeypair.publicKey,
      queueAuthority: payer,
      gcNode: verifierKeypair.publicKey,
      permission: permissionKey,
    })
    .signers([verifierEnclaveSigner])
    .rpc();

  return {
    attestationQueueAccount: new AttestationQueueAccount(
      switchboardProgram,
      attesationQueueKeypair.publicKey
    ),
    verifier: {
      quoteAccount: new EnclaveAccount(
        switchboardProgram,
        verifierKeypair.publicKey
      ),
      permissionAccount: new AttestationPermissionAccount(
        switchboardProgram,
        permissionKey
      ),
      signer: verifierEnclaveSigner,
    },
  };
}

export interface ICreatorSeed {
  slot?: number;
  seed?: RawBuffer;
}

export interface IEscrowManager {
  publicKey: anchor.web3.PublicKey;
  authority: anchor.web3.Keypair;
  escrow: anchor.web3.PublicKey;
}

export async function createFunction(
  switchboard: BootstrappedAttestationQueue,
  fnSeed?: number | ICreatorSeed,
  wallet?: SwitchboardWallet,
  authority?: anchor.web3.PublicKey
  // escrowManager?: IEscrowManager
): Promise<[FunctionAccount, string]> {
  const switchboardProgram = switchboard.attestationQueueAccount.program;
  const program: anchor.Program<SwitchboardAttestationProgram> = (
    switchboardProgram as any
  )._attestationProgram;

  const payer = (program.provider as anchor.AnchorProvider).publicKey;

  let slot: number;
  let creatorSeed: Uint8Array | undefined = undefined;

  if (fnSeed && typeof fnSeed === "number") {
    slot = fnSeed;
  } else {
    if (fnSeed && typeof fnSeed !== "number" && fnSeed.slot) {
      slot = fnSeed.slot;
    } else {
      slot = (
        await switchboardProgram.connection.getLatestBlockhashAndContext({
          commitment: "processed",
        })
      ).context.slot;
    }

    if (fnSeed && typeof fnSeed !== "number" && fnSeed.seed) {
      if (typeof fnSeed.seed === "string") {
        creatorSeed = new Uint8Array(Buffer.from(fnSeed.seed, "utf-8")).slice(
          0,
          32
        );
      } else {
        creatorSeed = parseRawBuffer(fnSeed.seed, 32);
      }
    }
  }

  const recentSlot = new anchor.BN(slot);

  const functionPubkey = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("FunctionAccountData"),
      creatorSeed ?? payer.toBytes(),
      recentSlot.toBuffer("le", 8),
    ],
    program.programId
  )[0];

  const switchboardWallet: SwitchboardWallet =
    wallet ??
    SwitchboardWallet.fromSeed(
      switchboardProgram,
      switchboard.attestationQueueAccount.publicKey,
      authority ?? payer,
      functionPubkey
    );

  const functionQuotePubkey = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("QuoteAccountData"), functionPubkey.toBytes()],
    program.programId
  )[0];

  const cronSchedule = parseCronSchedule("* * * * * *");

  const addressLookupProgram = new anchor.web3.PublicKey(
    "AddressLookupTab1e1111111111111111111111111"
  );
  const [addressLookupTable] = anchor.web3.PublicKey.findProgramAddressSync(
    [functionPubkey.toBuffer(), recentSlot.toBuffer("le", 8)],
    addressLookupProgram
  );

  console.log(`creatorSeed: ${creatorSeed}`);
  console.log(`recentSlot: ${recentSlot.toNumber()}`);
  console.log(`function: ${functionPubkey}`);
  console.log(`fnQuote: ${functionQuotePubkey}`);
  console.log(`wallet: ${switchboardWallet.publicKey}`);
  console.log(`tokenWallet: ${switchboardWallet.tokenWallet}`);

  const txn = await program.methods
    .functionInit({
      name: Buffer.from(""),
      metadata: Buffer.from(""),
      container: Buffer.from(container),
      containerRegistry: Buffer.from(containerRegistry),
      version: Buffer.from("latest"),
      schedule: Buffer.from(cronSchedule, "utf8"),
      mrEnclave: Array.from(containerMrEnclave),
      recentSlot: recentSlot,
      requestsDisabled: false,
      requestsRequireAuthorization: false,
      requestsDefaultSlotsUntilExpiration: new anchor.BN(0),
      requestsFee: new anchor.BN(10),
      creatorSeed: creatorSeed ? Array.from(creatorSeed) : null,
    })
    .accounts({
      function: functionPubkey,
      addressLookupTable,
      authority: authority ?? payer,
      quote: functionQuotePubkey,
      attestationQueue: switchboard.attestationQueueAccount.publicKey,
      payer: payer,
      wallet: switchboardWallet.publicKey,
      tokenWallet: switchboardWallet.tokenWallet,
      state: switchboardProgram.attestationProgramState.publicKey,
      mint: switchboardProgram.mint.address,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      addressLookupProgram: addressLookupProgram,
    })
    .preInstructions([
      anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 250_000,
      }),
    ])
    .rpc({ skipPreflight: true, preflightCommitment: "processed" })
    .catch((e) => {
      console.error(e);
      throw e;
    });

  return [new FunctionAccount(switchboardProgram, functionPubkey), txn];
}

export function jsonReplacers(key: string, value: unknown) {
  /// wtf, doesnt work
  if (anchor.BN.isBN(value) || value instanceof anchor.BN) {
    return value.toString(10);
  }
  if (value instanceof anchor.web3.PublicKey) {
    return value.toString();
  }
  if (
    Array.isArray(value) &&
    value.every((v) => typeof v === "number" && v === 0)
  ) {
    return undefined;
  }
  return value;
}

export async function printLogs(
  connection: anchor.web3.Connection,
  tx: string,
  delay = 3000
) {
  await sleep(delay);
  const parsed = await connection.getParsedTransaction(tx, {
    commitment: "confirmed",
  });
  console.log(parsed?.meta?.logMessages?.join("\n"));
}

export const roundNum = (num: number, decimalPlaces = 2): number => {
  assert(decimalPlaces > 0 && decimalPlaces < 16);
  const base = Math.pow(10, decimalPlaces);
  return Math.round((num + Number.EPSILON) * base) / base;
};
