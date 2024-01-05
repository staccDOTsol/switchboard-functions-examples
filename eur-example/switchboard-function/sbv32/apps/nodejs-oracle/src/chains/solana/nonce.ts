import { NodeMetrics } from "../../modules/metrics";

import * as anchor from "@coral-xyz/anchor";
import type {
  AccountInfo,
  Connection,
  Keypair,
  NonceInformation,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  NONCE_ACCOUNT_LENGTH,
  NonceAccount,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { SwitchboardAccount } from "@switchboard-xyz/solana.js";
import assert from "assert";
import crypto from "crypto";

export type NonceAccountWithContext = NonceAccount & { minContextSlot: number };
export type NonceInformationWithContext = NonceInformation & {
  minContextSlot: number;
};

export class Nonce {
  readonly connection: Connection;
  readonly authority: Keypair;
  readonly baseSeed: string;
  readonly publicKey: PublicKey;
  lastRequested: number | undefined = undefined;

  constructor(
    connection: Connection,
    authority: Keypair,
    baseSeed: string,
    noncePubkey: PublicKey
  ) {
    this.connection = connection;
    this.authority = authority;
    this.baseSeed = baseSeed;
    this.publicKey = noncePubkey;
  }

  private recordUsage() {
    const now = Date.now();
    if (this.lastRequested !== undefined) {
      NodeMetrics.getInstance()?.recordLogAge(now - this.lastRequested);
    }
    this.lastRequested = now;
  }

  static getPubkeyFromSeed(
    account: SwitchboardAccount,
    authority: Keypair,
    baseSeed: string
  ): [PublicKey, string] {
    const seed = `${baseSeed}-${account.publicKey.toBase58()}`;
    const seedHashBuffer = crypto.createHash("sha256").update(seed).digest();
    assert(seedHashBuffer.byteLength === 32);
    const seedHashString = seedHashBuffer.toString("hex").slice(0, 32);
    const derivedPubkey = anchor.utils.publicKey.createWithSeedSync(
      authority.publicKey,
      seedHashString,
      SystemProgram.programId
    );
    return [derivedPubkey, seedHashString];
  }

  static createNonceInstructions(
    account: SwitchboardAccount,
    authority: Keypair,
    baseSeed: string,
    nonceRentExemption: number
  ): TransactionInstruction[] {
    const [noncePubkey, seed] = Nonce.getPubkeyFromSeed(
      account,
      authority,
      baseSeed
    );

    const createNonceInstructions: TransactionInstruction[] = [
      SystemProgram.createAccountWithSeed({
        fromPubkey: authority.publicKey,
        newAccountPubkey: noncePubkey,
        basePubkey: authority.publicKey,
        seed: seed,
        lamports: nonceRentExemption,
        space: NONCE_ACCOUNT_LENGTH,
        programId: SystemProgram.programId,
      }),
      SystemProgram.nonceInitialize({
        noncePubkey: noncePubkey,
        authorizedPubkey: authority.publicKey,
      }),
    ];

    return createNonceInstructions;
  }

  /** Get or create a nonce account from a seed
   * @param oracleAccount switchboard oracle account
   * @param authority the pubkey used to derive the noncePubkey, must sign
   * @param baseSeed the seed used to derive the noncePubkey
   * @returns Nonce
   */
  static async getOrCreate(
    account: SwitchboardAccount,
    authority: Keypair,
    baseSeed: string
  ): Promise<Nonce> {
    const connection = account.program.provider.connection;
    const [noncePubkey, seed] = Nonce.getPubkeyFromSeed(
      account,
      authority,
      baseSeed
    );

    try {
      const nonceAccount = await connection.getNonce(noncePubkey, "processed");
      if (nonceAccount !== null) {
        return new Nonce(connection, authority, baseSeed, noncePubkey);
      }

      // nonce not created yet
      const nonceRentExemption =
        await connection.getMinimumBalanceForRentExemption(
          NONCE_ACCOUNT_LENGTH
        );
      const nonceTxn = new Transaction({ feePayer: authority.publicKey });
      nonceTxn.add(
        SystemProgram.createAccountWithSeed({
          fromPubkey: authority.publicKey,
          newAccountPubkey: noncePubkey,
          basePubkey: authority.publicKey,
          seed: seed,
          lamports: nonceRentExemption,
          space: NONCE_ACCOUNT_LENGTH,
          programId: SystemProgram.programId,
        }),
        // init nonce account
        SystemProgram.nonceInitialize({
          noncePubkey: noncePubkey,
          authorizedPubkey: authority.publicKey,
        })
      );

      const nonceSignature = await connection.sendTransaction(nonceTxn, [
        authority,
      ]);

      NodeLogger.getInstance().info(
        `Created oracle nonce account: ${noncePubkey}, seed: ${seed}, sig: ${nonceSignature}`
      );

      return new Nonce(connection, authority, baseSeed, noncePubkey);
    } catch (error: any) {
      throw error;
    }
  }

  static async getHeartbeatNonceAccount(
    account: SwitchboardAccount,
    oracleAuthority: Keypair
  ): Promise<Nonce> {
    return await Nonce.getOrCreate(account, oracleAuthority, `OracleHeartbeat`);
  }

  static async getUnwrapStakeNonceAccount(
    account: SwitchboardAccount,
    oracleAuthority: Keypair
  ): Promise<Nonce> {
    return await Nonce.getOrCreate(
      account,
      oracleAuthority,
      `UnwrapStakeAccount`
    );
  }

  async loadNonce(): Promise<NonceAccountWithContext> {
    const nonceAccountResponse = await this.connection.getNonceAndContext(
      this.publicKey
    );
    if (nonceAccountResponse === null || nonceAccountResponse.value === null) {
      throw new Error(
        `failed to fetch nonceAccount ${this.publicKey.toBase58()}`
      );
    }
    return {
      ...nonceAccountResponse.value,
      minContextSlot: nonceAccountResponse.context.slot,
    };
  }

  async loadNonceInfo(
    nonceAccount?: NonceAccountWithContext,
    recordUsage = true
  ): Promise<NonceInformationWithContext> {
    const nonceAcct = nonceAccount ?? (await this.loadNonce());
    if (recordUsage) {
      this.recordUsage();
    }
    return {
      nonce: nonceAcct.nonce!,
      nonceInstruction: SystemProgram.nonceAdvance({
        noncePubkey: this.publicKey,
        authorizedPubkey: this.authority.publicKey,
      }),
      minContextSlot: nonceAcct.minContextSlot,
    };
  }

  static decode(info: AccountInfo<Buffer>): NonceAccount {
    if (info === null) {
      throw new Error("FAILED_TO_FIND_ACCOUNT");
    }
    if (!info.owner.equals(SystemProgram.programId)) {
      throw new Error("INVALID_ACCOUNT_OWNER");
    }
    if (info.data.length !== NONCE_ACCOUNT_LENGTH) {
      throw new Error(`Invalid account size`);
    }

    const data = Buffer.from(info.data);
    return NonceAccount.fromAccountData(data);
  }

  static decodeAcct(
    info: AccountInfo<Buffer>,
    minContextSlot: number
  ): NonceAccountWithContext {
    const nonceAccount = Nonce.decode(info);
    return { ...nonceAccount, minContextSlot };
  }
}
