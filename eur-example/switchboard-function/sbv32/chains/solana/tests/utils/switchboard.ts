import type { SwitchboardAttestationProgram } from "../../target/types/switchboard_attestation_program";

import { AnchorProgramWallets } from "./anchor_utils";
import { SwitchboardAttestationQueue } from "./queue";

import type * as anchor from "@coral-xyz/anchor";
import type { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { AnchorWallet, NativeMint } from "@switchboard-xyz/solana.js";

/**
 * A helper class to interact with a Switchboard Attestation Queue within your tests. This class
 * will initialize 20 wallets with a pre-funded escrow, along with a set of queues to test against.
 */
export class Switchboard<T extends anchor.Idl> extends AnchorProgramWallets<T> {
  private static _sbInstance: Promise<Switchboard<anchor.Idl>> | undefined =
    undefined;

  // The Switchboard Attestation Program State pubkey.
  attestationProgramState = PublicKey.findProgramAddressSync(
    [Buffer.from("STATE")],
    this.programId
  )[0];

  // The default attestation queue.
  defaultQueue: SwitchboardAttestationQueue;

  private constructor(
    defaultProgram: Program<T>,
    readonly programs: Program<T>[],
    readonly mint: NativeMint,
    defaultAttestationQueue: SwitchboardAttestationQueue
  ) {
    super(defaultProgram, programs, mint);

    this.defaultQueue = defaultAttestationQueue;
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
  ): Promise<Switchboard<T>> {
    if (!Switchboard._sbInstance) {
      Switchboard._sbInstance = Switchboard.getOrCreate(program, solAmount);
    }

    return Switchboard._sbInstance as Promise<Switchboard<T>>;
  }

  /**
   * Sets up multiple wallets with a given amount of SOL and returns an array of anchor programs with a newly funded provider.
   * @param program - The program to use for setting up the wallets.
   * @param solAmount - The amount of SOL to pre-fund each wallet up to. (e.g. 1.25 = 1.25 SOL = 1250000000 lamports)
   * @returns The AnchorProgramWallets class with 20 pre-funded wallets initialized with the given walletAmount.
   */
  private static async getOrCreate<T extends anchor.Idl>(
    program: Program<T>,
    solAmount = 1
  ): Promise<Switchboard<T>> {
    const provider = program.provider as AnchorProvider;
    const wallet = provider.wallet as AnchorWallet;
    const payer = wallet.payer;

    const programs = await AnchorProgramWallets.initialize(program, solAmount);

    const attestationQueue = await SwitchboardAttestationQueue.getOrCreate(
      program as any
    );

    // idk why SwitchboardAttestationProgram doesnt extend anchor.Idl
    return new Switchboard(
      programs.default as any,
      programs.programs as any,
      programs.mint,
      attestationQueue
    );
  }
}
