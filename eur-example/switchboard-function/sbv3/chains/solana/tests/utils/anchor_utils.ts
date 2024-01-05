import { AnchorProvider, Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import type { AccountInfo, PublicKey } from "@solana/web3.js";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import {
  type AnchorWallet,
  NativeMint,
  TransactionObject,
} from "@switchboard-xyz/solana.js";
import crypto from "crypto";

/**
 * A helper class that initializes 20 new instances of an Anchor program class with pre-funded wallets. The accounts
 * are derived from the payer secret key and a nonce, so they can be recreated if the payer secret key is known to avoid
 * unnecessary SOL transfers.
 *
 * This class is meant to be used within a test framework and makes use of an async singleton so it can be invoked once and
 * re-used in different test modules.
 *
 * @example
 * ```
 * import { AnchorProgramWallets } from "./wallets";
 *
 * const programWallets = await AnchorProgramWallets.initialize(program);
 * ```
 */
export class AnchorProgramWallets<T extends anchor.Idl> {
  private static _instance:
    | Promise<AnchorProgramWallets<anchor.Idl>>
    | undefined = undefined;

  readonly default: Program<T>;

  constructor(
    defaultProgram: Program<T>,
    readonly programs: Program<T>[],
    readonly mint: NativeMint
  ) {
    if (programs.length !== 20) {
      throw new Error(
        `AnchorProgramWallets must be initialized with 20 programs`
      );
    }

    this.default = defaultProgram;
  }

  /**
   * Sets up multiple wallets with a given amount of SOL and returns an array of anchor programs with a newly funded provider.
   * @param program - The program to use for setting up the wallets.
   * @param solAmount - The amount of SOL to pre-fund each wallet up to. (e.g. 1.25 = 1.25 SOL = 1250000000 lamports)
   * @returns The AnchorProgramWallets class with 20 pre-funded wallets initialized with the given walletAmount.
   */
  public static async initialize<T extends anchor.Idl>(
    program: Program<T>,
    solAmount = 1
  ): Promise<AnchorProgramWallets<T>> {
    if (!AnchorProgramWallets._instance) {
      AnchorProgramWallets._instance = AnchorProgramWallets.create(
        program,
        solAmount
      );
    }

    return AnchorProgramWallets._instance as Promise<AnchorProgramWallets<T>>;
  }

  /**
   * Sets up multiple wallets with a given amount of SOL and returns an array of anchor programs with a newly funded provider.
   * @param program - The program to use for setting up the wallets.
   * @param solAmount - The amount of SOL to pre-fund each wallet up to. (e.g. 1.25 = 1.25 SOL = 1250000000 lamports)
   * @returns The AnchorProgramWallets class with 20 pre-funded wallets initialized with the given walletAmount.
   */
  private static async create<T extends anchor.Idl>(
    program: Program<T>,
    solAmount = 1
  ): Promise<AnchorProgramWallets<T>> {
    const numWallets = 20;
    const walletAmount = solAmount * LAMPORTS_PER_SOL;

    const provider = program.provider as AnchorProvider;
    const wallet = provider.wallet as AnchorWallet;
    const payer = wallet.payer;

    const programs = await AnchorProgramWallets.createPrograms(
      program,
      solAmount
    );

    // kind of hacky but need to create a wrapped SOL account for the default wallet
    const mint = await NativeMint.load(provider);
    await mint.getOrCreateWrappedUser(provider.wallet.publicKey, {
      fundUpTo: 0.1,
    });

    return new AnchorProgramWallets(program, programs, mint);
  }

  /**
   * Sets up multiple wallets with a given amount of SOL and returns an array of anchor programs with a newly funded provider.
   * @param program - The program to use for setting up the wallets.
   * @param solAmount - The amount of SOL to pre-fund each wallet up to. (e.g. 1.25 = 1.25 SOL = 1250000000 lamports)
   * @returns The AnchorProgramWallets class with 20 pre-funded wallets initialized with the given walletAmount.
   */
  private static async createPrograms<T extends anchor.Idl>(
    program: Program<T>,
    solAmount = 1
  ): Promise<Program<T>[]> {
    const numWallets = 20;
    const walletAmount = solAmount * LAMPORTS_PER_SOL;

    const provider = program.provider as AnchorProvider;
    const wallet = provider.wallet as AnchorWallet;
    const payer = wallet.payer;

    const txns: TransactionObject[] = [];
    const programs: Program<T>[] = [];

    // Rent exemption for a SystemAccount
    const rentExemption =
      await program.provider.connection.getMinimumBalanceForRentExemption(0);

    // Derive each keypair using the payer secretKey and a nonce
    const keypairsFromSeed = Array.from(
      { length: numWallets },
      (v, k) => k
    ).map((i) => {
      // Create with the payer secret key to prevent stealing
      const seed = `SbTesting-Wallet-${i}-${Buffer.from(
        payer.secretKey
      ).toString("hex")}`;
      const seedHashBuffer = crypto.createHash("sha256").update(seed).digest();
      return Keypair.fromSeed(seedHashBuffer.slice(0, 32));
    });

    const keypairMap = new Map<string, Keypair>(
      keypairsFromSeed.map((kp) => [kp.publicKey.toString(), kp])
    );

    const pubkeys = keypairsFromSeed.map((kp) => kp.publicKey);
    const accountInfos = await provider.connection.getMultipleAccountsInfo(
      pubkeys
    );
    const accounts: {
      publicKey: PublicKey;
      keypair: Keypair;
      info?: AccountInfo<Buffer>;
    }[] = accountInfos.map((info, i) => {
      const publicKey = pubkeys[i];
      const keypair = keypairMap.get(publicKey.toString());
      if (!keypair) {
        throw new Error(
          `Failed to find keypair for account ${publicKey.toString()}`
        );
      }

      if (info) {
        return {
          publicKey,
          keypair,
          info: info!,
        };
      } else {
        return {
          publicKey,
          keypair,
          info: undefined,
        };
      }
    });

    // Loop through each and check whether we need to create or fund the account
    for await (const account of accounts) {
      // Check if account is created but needs funding
      if (account && account.info) {
        const missingBalance = walletAmount - account.info.lamports;
        const missingBalancePct = (missingBalance / walletAmount) * 100;
        // Only transfer funds if we're more than 1% off the expected wallet amount
        if (missingBalance > 0 && missingBalancePct > 1) {
          const transferIxn = SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: account.publicKey,
            lamports: missingBalance,
          });
          txns.push(
            new TransactionObject(payer.publicKey, [transferIxn], [payer])
          );
        }
      } else {
        // If no AccountInfo found, create and fund a new account
        const createIxn = SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: account.publicKey,
          lamports: rentExemption,
          space: 0,
          programId: SystemProgram.programId,
        });
        const transferIxn = SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: account.publicKey,
          lamports: walletAmount,
        });
        txns.push(
          new TransactionObject(
            payer.publicKey,
            [createIxn, transferIxn],
            [payer, account.keypair]
          )
        );
      }

      // Add program/provider to arrays
      programs.push(
        new Program(
          program.idl,
          program.programId,
          new AnchorProvider(
            program.provider.connection,
            new anchor.Wallet(account.keypair),
            provider.opts
          )
        )
      );
    }

    // Send any transactions if we need to create any new accounts
    if (txns.length > 0) {
      const signatures = await TransactionObject.signAndSendAll(
        provider,
        TransactionObject.pack(txns),
        undefined,
        { ...(await program.provider.connection.getLatestBlockhash()) },
        10
      );

      if (process.env.DEBUG || process.env.VERBOSE) {
        console.log(
          `[TX] setupAnchorProgramWallets:\n\t${signatures
            .map((s, i) => `#${i + 1} - ${s}`)
            .join("\n\t")}`
        );
      }
    }

    return programs;
  }

  getProgram(index?: number): Program<T> {
    if (index === undefined || index === 0) {
      return this.default;
    }
    if (index <= 0 || index > 20) {
      throw new Error(`Index must be between 1 and 20`);
    }

    return this.programs[index - 1];
  }

  getProvider(index?: number): AnchorProvider {
    const program = this.getProgram(index);
    return program.provider as AnchorProvider;
  }

  getWallet(index?: number): AnchorWallet {
    const provider = this.getProvider(index);
    return provider.wallet as AnchorWallet;
  }

  getPayer(index?: number): Keypair {
    const wallet = this.getWallet(index);
    return wallet.payer;
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  // Super ugly but dont care

  // default program

  get program(): Program<T> {
    return this.getProgram();
  }
  get provider(): AnchorProvider {
    return this.getProvider();
  }
  get payer(): Keypair {
    return this.getPayer();
  }

  get program1(): Program<T> {
    return this.getProgram(1);
  }
  get provider1(): AnchorProvider {
    return this.getProvider(1);
  }
  get payer1(): Keypair {
    return this.getPayer(1);
  }

  get program2(): Program<T> {
    return this.getProgram(2);
  }
  get provider2(): AnchorProvider {
    return this.getProvider(2);
  }
  get payer2(): Keypair {
    return this.getPayer(2);
  }

  get program3(): Program<T> {
    return this.getProgram(3);
  }
  get provider3(): AnchorProvider {
    return this.getProvider(3);
  }
  get payer3(): Keypair {
    return this.getPayer(3);
  }

  get program4(): Program<T> {
    return this.getProgram(4);
  }
  get provider4(): AnchorProvider {
    return this.getProvider(4);
  }
  get payer4(): Keypair {
    return this.getPayer(4);
  }

  get program5(): Program<T> {
    return this.getProgram(5);
  }
  get provider5(): AnchorProvider {
    return this.getProvider(5);
  }
  get payer5(): Keypair {
    return this.getPayer(5);
  }

  get program6(): Program<T> {
    return this.getProgram(6);
  }
  get provider6(): AnchorProvider {
    return this.getProvider(6);
  }
  get payer6(): Keypair {
    return this.getPayer(6);
  }

  get program7(): Program<T> {
    return this.getProgram(7);
  }
  get provider7(): AnchorProvider {
    return this.getProvider(7);
  }
  get payer7(): Keypair {
    return this.getPayer(7);
  }

  get program8(): Program<T> {
    return this.getProgram(8);
  }
  get provider8(): AnchorProvider {
    return this.getProvider(8);
  }
  get payer8(): Keypair {
    return this.getPayer(8);
  }

  get program9(): Program<T> {
    return this.getProgram(9);
  }
  get provider9(): AnchorProvider {
    return this.getProvider(9);
  }
  get payer9(): Keypair {
    return this.getPayer(9);
  }

  get program10(): Program<T> {
    return this.getProgram(10);
  }
  get provider10(): AnchorProvider {
    return this.getProvider(10);
  }
  get payer10(): Keypair {
    return this.getPayer(10);
  }

  get program11(): Program<T> {
    return this.getProgram(11);
  }
  get provider11(): AnchorProvider {
    return this.getProvider(11);
  }
  get payer11(): Keypair {
    return this.getPayer(11);
  }

  get program12(): Program<T> {
    return this.getProgram(12);
  }
  get provider12(): AnchorProvider {
    return this.getProvider(12);
  }
  get payer12(): Keypair {
    return this.getPayer(12);
  }

  get program13(): Program<T> {
    return this.getProgram(13);
  }
  get provider13(): AnchorProvider {
    return this.getProvider(13);
  }
  get payer13(): Keypair {
    return this.getPayer(13);
  }

  get program14(): Program<T> {
    return this.getProgram(14);
  }
  get provider14(): AnchorProvider {
    return this.getProvider(14);
  }
  get payer14(): Keypair {
    return this.getPayer(14);
  }

  get program15(): Program<T> {
    return this.getProgram(15);
  }
  get provider15(): AnchorProvider {
    return this.getProvider(15);
  }
  get payer15(): Keypair {
    return this.getPayer(15);
  }

  get program16(): Program<T> {
    return this.getProgram(16);
  }
  get provider16(): AnchorProvider {
    return this.getProvider(16);
  }
  get payer16(): Keypair {
    return this.getPayer(16);
  }

  get program17(): Program<T> {
    return this.getProgram(17);
  }
  get provider17(): AnchorProvider {
    return this.getProvider(17);
  }
  get payer17(): Keypair {
    return this.getPayer(17);
  }

  get program18(): Program<T> {
    return this.getProgram(18);
  }
  get provider18(): AnchorProvider {
    return this.getProvider(18);
  }
  get payer18(): Keypair {
    return this.getPayer(18);
  }

  get program19(): Program<T> {
    return this.getProgram(19);
  }
  get provider19(): AnchorProvider {
    return this.getProvider(19);
  }
  get payer19(): Keypair {
    return this.getPayer(19);
  }

  get program20(): Program<T> {
    return this.getProgram(20);
  }
  get provider20(): AnchorProvider {
    return this.getProvider(20);
  }
  get payer20(): Keypair {
    return this.getPayer(20);
  }
}
