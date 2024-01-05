/// <reference types="node" />
import {
  Connection,
  TransactionSignature,
  TransactionInstruction,
  Signer,
} from "@solana/web3.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
export { STABLE_SWAP_N_POOL_PROGRAM_ID } from "./instructions";
export declare const SIMULATION_USER: PublicKey;
export declare const FEE_DENOMINATOR: number;
export interface TransactionSignerAndSender {
  userPublicKey: PublicKey;
  send: (
    connection: Connection,
    instructions: TransactionInstruction[],
    signers: Signer[]
  ) => Promise<TransactionSignature>;
}
interface SimulationTokenAccounts {
  tokenAccounts: PublicKey[];
  tokenAccountLP: PublicKey;
}
/**
 * Our main swap
 */
export declare class StableSwapNPool {
  poolAccount: PublicKey;
  poolTokenMint: PublicKey;
  authority: PublicKey;
  amplificationCoefficient: number;
  feeNumerator: number;
  adminFeeNumerator: number;
  precisionFactor: number;
  precisionMultipliers: number[];
  addLiquidityEnabled: boolean;
  tokenAccounts: PublicKey[];
  tokenMints: PublicKey[];
  connection?: Connection | undefined;
  private simulationUser?;
  private simulationTokenAccounts?;
  /**
   * Create a StableSwapNPool object attached to the specific Vault pool
   *
   * @param connection The connection to use
   * @param poolAccount The pool account
   * @param poolTokenMint The pool token mint
   * @param authority The authority over the vault and accounts
   * @param tokenAccounts: The vault pool token accounts
   * @param tokenMints: The vault pool token mints
   */
  constructor(
    poolAccount: PublicKey,
    poolTokenMint: PublicKey,
    authority: PublicKey,
    amplificationCoefficient: number,
    feeNumerator: number,
    adminFeeNumerator: number,
    precisionFactor: number,
    precisionMultipliers: number[],
    addLiquidityEnabled: boolean,
    tokenAccounts: PublicKey[],
    tokenMints: PublicKey[],
    connection?: Connection | undefined,
    simulationUser?: PublicKey | undefined,
    simulationTokenAccounts?: SimulationTokenAccounts | undefined
  );
  /**
   * Get the minimum balance for the token swap account to be rent exempt
   *
   * @return Number of lamports required
   */
  static getMinBalanceRentForExemptSwapState(
    connection: Connection
  ): Promise<number>;
  /**
   * Create a new StableSwapNPool
   *
   * @param connection The connection to use
   * @param poolAccount The pool account
   * @param authority The authority over the pool and accounts
   * @param tokenAccounts: The pool token accounts
   * @param poolTokenMint The pool token mint
   * @param nonce The nonce used to generate the authority
   * @return The new StableSwapNPool
   */
  static create(
    connection: Connection,
    sender: TransactionSignerAndSender,
    poolAccount: Keypair,
    authority: PublicKey,
    tokenAccounts: PublicKey[],
    poolTokenMint: PublicKey,
    adminTokenMint: PublicKey,
    nonce: number,
    amplificationCoefficient: number,
    feeNumerator: number,
    adminFeeNumerator: number,
    addLiquidityEnabled: boolean,
    simulationPayer: Signer,
    simulationUser: PublicKey
  ): Promise<StableSwapNPool>;
  static getTokenMints(
    connection: Connection,
    address: PublicKey
  ): Promise<Record<string, string>>;
  static loadWithData(
    poolAddress: PublicKey,
    poolData: Buffer,
    authority: PublicKey
  ): StableSwapNPool;
  static load(
    connection: Connection,
    address: PublicKey,
    simulationUser: PublicKey,
    cache?: Boolean
  ): Promise<StableSwapNPool>;
  addLiquidity(
    sender: TransactionSignerAndSender,
    userSourceTokenAccounts: PublicKey[],
    userLpTokenAccount: PublicKey,
    depositAmounts: BN[],
    minMintAmount: BN,
    instructions: TransactionInstruction[],
    cleanupInstructions?: TransactionInstruction[],
    signers?: Signer[]
  ): Promise<TransactionResult<BN>>;
  removeLiquidity(
    sender: TransactionSignerAndSender,
    userDestinationTokenAccounts: PublicKey[],
    userLpTokenAccount: PublicKey,
    unmintAmount: BN,
    minimumAmounts: BN[],
    instructions: TransactionInstruction[],
    cleanupInstructions?: TransactionInstruction[],
    signers?: Signer[]
  ): Promise<TransactionResult<GetWithdrawalAmounts>>;
  removeLiquidityOneToken(
    sender: TransactionSignerAndSender,
    userDestinationTokenAccount: PublicKey,
    userLpTokenAccount: PublicKey,
    unmintAmount: BN,
    minimumAmount: BN,
    instructions: TransactionInstruction[],
    cleanupInstructions?: TransactionInstruction[],
    signers?: Signer[]
  ): Promise<TransactionResult<GetWithdrawalAmount>>;
  exchange(
    sender: TransactionSignerAndSender,
    userSourceTokenAccount: PublicKey,
    userDestinationTokenAccount: PublicKey,
    inAmount: BN,
    minimumOutAmount: BN,
    instructions: TransactionInstruction[]
  ): Promise<TransactionResult<GetDyUnderlying>>;
  exchangeHack(
    user: PublicKey,
    userSourceTokenAccount: PublicKey,
    userDestinationTokenAccount: PublicKey,
    inAmount: BN,
    minimumOutAmount: BN,
    instructions: TransactionInstruction[]
  ): Promise<{
    instructions: TransactionInstruction[];
    signers: Keypair[];
  }>;
  getOutAmount(
    sourceTokenMint: PublicKey,
    destinationTokenMint: PublicKey,
    inAmount: BN
  ): Promise<number>;
  getMintAmount(depositAmounts: BN[]): Promise<BN>;
  getWithdrawalAmounts(unmintAmount: BN): Promise<GetWithdrawalAmounts>;
  getWithdrawalAmount(
    destinationTokenMint: PublicKey,
    unmintAmount: BN
  ): Promise<GetWithdrawalAmount>;
  getVirtualPrice(): Promise<GetVirtualPrice>;
  /**
   * Setup simulation user, if payer is provided tries to create token accounts, otherwise assumes they are created
   */
  static setupSimulationUser(
    connection: Connection,
    simulationUser: PublicKey,
    tokenMints: PublicKey[],
    poolTokenMint: PublicKey,
    payer?: Signer
  ): Promise<SimulationTokenAccounts>;
  private static getTokenAccountMint;
  private static getTokenAccountMintAsync;
}
export interface GetDyUnderlying {
  dy: number;
}
export interface GetWithdrawalAmounts {
  amounts: number[];
}
export interface GetWithdrawalAmount {
  dy: number;
}
export interface GetVirtualPrice {
  virtualPrice: number;
}
export interface TransactionResult<T> {
  txid: TransactionSignature;
  result: T | null;
}
export declare function findLogAndParse<T>(
  logs: string[] | null,
  name: string
): T | null;
export declare function findLogAndParseWithRegex(
  logs: string[] | null,
  re: RegExp
): BN | null;
export declare function getSimulateSwapInstructions(
  hgPool: StableSwapNPool,
  inKey: PublicKey,
  outKey: PublicKey,
  simulationUser: PublicKey,
  inAmount: BN
): TransactionInstruction[];
//# sourceMappingURL=index.d.ts.map
