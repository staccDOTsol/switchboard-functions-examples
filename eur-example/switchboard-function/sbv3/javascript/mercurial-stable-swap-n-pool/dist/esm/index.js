var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
import { SwapState } from "./state";
import { SwapInstruction, STABLE_SWAP_N_POOL_PROGRAM_ID } from "./instructions";
import { loadAccount } from "./helpers/loadAccount";
import { Transaction } from "@solana/web3.js";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { sleep } from "./helpers/sleep";
import tokenMints from "./token-mints.json";
import BN from "bn.js";
export { STABLE_SWAP_N_POOL_PROGRAM_ID } from "./instructions";
export const SIMULATION_USER = new PublicKey(
  "HrY9qR5TiB2xPzzvbBu5KrBorMfYGQXh9osXydz4jy9s"
);
export const FEE_DENOMINATOR = Math.pow(10, 10);
const RENT_EXEMPT_TOKEN_ACCOUNT_LAMPORTS = 2039280;
// For some reason, toBuffer will be required for u64 to work.
BN.prototype.toBuffer = function () {
  const a = this.toArray().reverse();
  const b = Buffer.from(a);
  if (b.length === 8) {
    return b;
  }
  const zeroPad = Buffer.alloc(8);
  b.copy(zeroPad);
  return zeroPad;
};
/**
 * Our main swap
 */
export class StableSwapNPool {
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
    poolAccount,
    poolTokenMint,
    authority,
    amplificationCoefficient,
    feeNumerator,
    adminFeeNumerator,
    precisionFactor,
    precisionMultipliers,
    addLiquidityEnabled,
    tokenAccounts,
    tokenMints,
    connection,
    simulationUser,
    simulationTokenAccounts
  ) {
    this.poolAccount = poolAccount;
    this.poolTokenMint = poolTokenMint;
    this.authority = authority;
    this.amplificationCoefficient = amplificationCoefficient;
    this.feeNumerator = feeNumerator;
    this.adminFeeNumerator = adminFeeNumerator;
    this.precisionFactor = precisionFactor;
    this.precisionMultipliers = precisionMultipliers;
    this.addLiquidityEnabled = addLiquidityEnabled;
    this.tokenAccounts = tokenAccounts;
    this.tokenMints = tokenMints;
    this.connection = connection;
    this.simulationUser = simulationUser;
    this.simulationTokenAccounts = simulationTokenAccounts;
  }
  /**
   * Get the minimum balance for the token swap account to be rent exempt
   *
   * @return Number of lamports required
   */
  static getMinBalanceRentForExemptSwapState(connection) {
    return __awaiter(this, void 0, void 0, function* () {
      return yield connection.getMinimumBalanceForRentExemption(SwapState.span);
    });
  }
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
    connection,
    sender,
    poolAccount,
    authority,
    tokenAccounts,
    poolTokenMint,
    adminTokenMint,
    nonce,
    amplificationCoefficient,
    feeNumerator,
    adminFeeNumerator,
    addLiquidityEnabled,
    simulationPayer,
    simulationUser
  ) {
    return __awaiter(this, void 0, void 0, function* () {
      const tokenMints = yield Promise.all(
        tokenAccounts.map((tokenAccount) =>
          StableSwapNPool.getTokenAccountMint(connection, tokenAccount)
        )
      );
      yield StableSwapNPool.setupSimulationUser(
        connection,
        simulationUser,
        tokenMints,
        poolTokenMint,
        simulationPayer
      );
      const minBalanceForRentExemption =
        yield StableSwapNPool.getMinBalanceRentForExemptSwapState(connection);
      const instructions = [
        SystemProgram.createAccount({
          fromPubkey: sender.userPublicKey,
          newAccountPubkey: poolAccount.publicKey,
          lamports: minBalanceForRentExemption,
          space: SwapState.span,
          programId: STABLE_SWAP_N_POOL_PROGRAM_ID,
        }),
        SwapInstruction.initialize(
          poolAccount.publicKey,
          authority,
          tokenAccounts,
          tokenMints,
          poolTokenMint,
          adminTokenMint,
          nonce,
          amplificationCoefficient,
          feeNumerator,
          adminFeeNumerator,
          {
            swapEnabled: true,
            addLiquidityEnabled: addLiquidityEnabled,
          }
        ),
      ];
      yield sender.send(connection, instructions, [poolAccount]);
      yield sleep(2000);
      return StableSwapNPool.load(
        connection,
        poolAccount.publicKey,
        simulationUser
      );
    });
  }
  static getTokenMints(connection, address) {
    return __awaiter(this, void 0, void 0, function* () {
      const data = yield loadAccount(
        connection,
        address,
        STABLE_SWAP_N_POOL_PROGRAM_ID
      );
      const swapState = SwapState.decode(data);
      if (!swapState.isInitialized) {
        throw new Error(`Invalid vault state`);
      }
      // Hand manipulation of the underlying vec
      swapState.tokenAccounts = swapState.tokenAccounts.slice(
        0,
        swapState.tokenAccountsLength
      );
      const tokenMints = {};
      yield Promise.all(
        swapState.tokenAccounts.map((tokenAccount) =>
          __awaiter(this, void 0, void 0, function* () {
            const tokenMint = yield StableSwapNPool.getTokenAccountMint(
              connection,
              tokenAccount
            );
            tokenMints[tokenAccount.toBase58()] = tokenMint.toBase58();
          })
        )
      );
      return tokenMints;
    });
  }
  static loadWithData(poolAddress, poolData, authority) {
    const swapState = SwapState.decode(poolData);
    if (!swapState.isInitialized) {
      throw new Error(`Invalid vault state`);
    }
    // Hand manipulation of the underlying vec
    swapState.tokenAccounts = swapState.tokenAccounts.slice(
      0,
      swapState.tokenAccountsLength
    );
    const tokenMints = swapState.tokenAccounts.map((tokenAccount) =>
      StableSwapNPool.getTokenAccountMintAsync(tokenAccount)
    );
    return new StableSwapNPool(
      poolAddress,
      swapState.poolMint,
      authority,
      swapState.amplificationCoefficient.toNumber(),
      swapState.feeNumerator.toNumber(),
      swapState.adminFeeNumerator.toNumber(),
      swapState.precisionFactor.toNumber(),
      swapState.precisionMultipliers.map((precisionMultiplier) =>
        precisionMultiplier.toNumber()
      ),
      swapState.adminSettings.addLiquidityEnabled,
      swapState.tokenAccounts,
      tokenMints
    );
  }
  static load(connection, address, simulationUser, cache = true) {
    return __awaiter(this, void 0, void 0, function* () {
      const data = yield loadAccount(
        connection,
        address,
        STABLE_SWAP_N_POOL_PROGRAM_ID
      );
      const swapState = SwapState.decode(data);
      if (!swapState.isInitialized) {
        throw new Error(`Invalid vault state`);
      }
      // Hand manipulation of the underlying vec
      swapState.tokenAccounts = swapState.tokenAccounts.slice(
        0,
        swapState.tokenAccountsLength
      );
      const tokenMints = yield Promise.all(
        swapState.tokenAccounts.map((tokenAccount) =>
          StableSwapNPool.getTokenAccountMint(connection, tokenAccount, cache)
        )
      );
      const simulationTokenAccounts = yield StableSwapNPool.setupSimulationUser(
        connection,
        simulationUser,
        tokenMints,
        swapState.poolMint
      );
      const [authority] = yield PublicKey.findProgramAddress(
        [address.toBuffer()],
        STABLE_SWAP_N_POOL_PROGRAM_ID
      );
      return new StableSwapNPool(
        address,
        swapState.poolMint,
        authority,
        swapState.amplificationCoefficient.toNumber(),
        swapState.feeNumerator.toNumber(),
        swapState.adminFeeNumerator.toNumber(),
        swapState.precisionFactor.toNumber(),
        swapState.precisionMultipliers.map((precisionMultiplier) =>
          precisionMultiplier.toNumber()
        ),
        swapState.adminSettings.addLiquidityEnabled,
        swapState.tokenAccounts,
        tokenMints,
        connection,
        simulationUser,
        simulationTokenAccounts
      );
    });
  }
  addLiquidity(
    sender,
    userSourceTokenAccounts,
    userLpTokenAccount,
    depositAmounts,
    minMintAmount,
    instructions,
    cleanupInstructions = [],
    signers = []
  ) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.connection) {
        throw new Error("Connection is not defined");
      }
      const ephemeralKeypair = new Keypair();
      instructions = instructions.concat([
        ...userSourceTokenAccounts.map((userSourceTokenAccount, i) =>
          Token.createApproveInstruction(
            TOKEN_PROGRAM_ID,
            userSourceTokenAccount,
            ephemeralKeypair.publicKey,
            sender.userPublicKey,
            [],
            depositAmounts[i]
          )
        ),
        SwapInstruction.addLiquidity(
          this.poolAccount,
          this.authority,
          ephemeralKeypair.publicKey,
          this.tokenAccounts,
          this.poolTokenMint,
          userSourceTokenAccounts,
          userLpTokenAccount,
          depositAmounts,
          minMintAmount
        ),
        ...userSourceTokenAccounts.map((userSourceTokenAccount) =>
          Token.createRevokeInstruction(
            TOKEN_PROGRAM_ID,
            userSourceTokenAccount,
            sender.userPublicKey,
            []
          )
        ),
        ...cleanupInstructions,
      ]);
      const txid = yield sender.send(
        this.connection,
        instructions,
        signers.concat([ephemeralKeypair])
      );
      const result = findLogAndParseWithRegex(
        ((_b =
          (_a = yield this.connection.getTransaction(txid, {
            commitment: "confirmed",
          })) === null || _a === void 0
            ? void 0
            : _a.meta) === null || _b === void 0
          ? void 0
          : _b.logMessages) || [],
        new RegExp('GetMintAmount: {"mintAmount": (.+)}', "i")
      );
      return { txid, result };
    });
  }
  removeLiquidity(
    sender,
    userDestinationTokenAccounts,
    userLpTokenAccount,
    unmintAmount,
    minimumAmounts,
    instructions,
    cleanupInstructions = [],
    signers = []
  ) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.connection) {
        throw new Error("Connection is not defined");
      }
      const ephemeralKeypair = new Keypair();
      instructions = instructions.concat([
        Token.createApproveInstruction(
          TOKEN_PROGRAM_ID,
          userLpTokenAccount,
          ephemeralKeypair.publicKey,
          sender.userPublicKey,
          [],
          unmintAmount
        ),
        SwapInstruction.removeLiquidity(
          this.poolAccount,
          this.authority,
          ephemeralKeypair.publicKey,
          this.tokenAccounts,
          this.poolTokenMint,
          userDestinationTokenAccounts,
          userLpTokenAccount,
          unmintAmount,
          minimumAmounts
        ),
        Token.createRevokeInstruction(
          TOKEN_PROGRAM_ID,
          userLpTokenAccount,
          sender.userPublicKey,
          []
        ),
        ...cleanupInstructions,
      ]);
      const txid = yield sender.send(
        this.connection,
        instructions,
        signers.concat([ephemeralKeypair])
      );
      const result = findLogAndParse(
        ((_b =
          (_a = yield this.connection.getTransaction(txid, {
            commitment: "confirmed",
          })) === null || _a === void 0
            ? void 0
            : _a.meta) === null || _b === void 0
          ? void 0
          : _b.logMessages) || [],
        "GetWithdrawalAmounts"
      );
      return { txid, result };
    });
  }
  removeLiquidityOneToken(
    sender,
    userDestinationTokenAccount,
    userLpTokenAccount,
    unmintAmount,
    minimumAmount,
    instructions,
    cleanupInstructions = [],
    signers = []
  ) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.connection) {
        throw new Error("Connection is not defined");
      }
      const ephemeralKeypair = new Keypair();
      instructions = instructions.concat([
        Token.createApproveInstruction(
          TOKEN_PROGRAM_ID,
          userLpTokenAccount,
          ephemeralKeypair.publicKey,
          sender.userPublicKey,
          [],
          unmintAmount
        ),
        SwapInstruction.removeLiquidityOneToken(
          this.poolAccount,
          this.authority,
          ephemeralKeypair.publicKey,
          this.tokenAccounts,
          this.poolTokenMint,
          userDestinationTokenAccount,
          userLpTokenAccount,
          unmintAmount,
          minimumAmount
        ),
        Token.createRevokeInstruction(
          TOKEN_PROGRAM_ID,
          userLpTokenAccount,
          sender.userPublicKey,
          []
        ),
        ...cleanupInstructions,
      ]);
      const txid = yield sender.send(
        this.connection,
        instructions,
        signers.concat([ephemeralKeypair])
      );
      const result = findLogAndParse(
        ((_b =
          (_a = yield this.connection.getTransaction(txid, {
            commitment: "confirmed",
          })) === null || _a === void 0
            ? void 0
            : _a.meta) === null || _b === void 0
          ? void 0
          : _b.logMessages) || [],
        "GetWithdrawalAmount"
      );
      return { txid, result };
    });
  }
  exchange(
    sender,
    userSourceTokenAccount,
    userDestinationTokenAccount,
    inAmount,
    minimumOutAmount,
    instructions
  ) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.connection) {
        throw new Error("Connection is not defined");
      }
      const cleanupInstructions = [];
      const ephemeralKeypair = new Keypair();
      instructions = instructions.concat([
        Token.createApproveInstruction(
          TOKEN_PROGRAM_ID,
          userSourceTokenAccount,
          ephemeralKeypair.publicKey,
          sender.userPublicKey,
          [],
          inAmount
        ),
        SwapInstruction.exchange(
          this.poolAccount,
          this.authority,
          ephemeralKeypair.publicKey,
          this.tokenAccounts,
          userSourceTokenAccount,
          userDestinationTokenAccount,
          inAmount,
          minimumOutAmount
        ),
        Token.createRevokeInstruction(
          TOKEN_PROGRAM_ID,
          userSourceTokenAccount,
          sender.userPublicKey,
          []
        ),
      ]);
      const txid = yield sender.send(
        this.connection,
        instructions.concat(cleanupInstructions),
        [ephemeralKeypair]
      );
      const result = findLogAndParse(
        ((_b =
          (_a = yield this.connection.getTransaction(txid, {
            commitment: "confirmed",
          })) === null || _a === void 0
            ? void 0
            : _a.meta) === null || _b === void 0
          ? void 0
          : _b.logMessages) || [],
        "GetDyUnderlying"
      );
      return { txid, result };
    });
  }
  // TODO: Resolve this hack with a design that is homogeneous across libs
  // This is to bypass the need to delegate sending to the exchange method
  exchangeHack(
    user,
    userSourceTokenAccount,
    userDestinationTokenAccount,
    inAmount,
    minimumOutAmount,
    instructions
  ) {
    return __awaiter(this, void 0, void 0, function* () {
      const cleanupInstructions = [];
      const ephemeralKeypair = new Keypair();
      instructions = instructions.concat([
        Token.createApproveInstruction(
          TOKEN_PROGRAM_ID,
          userSourceTokenAccount,
          ephemeralKeypair.publicKey,
          user,
          [],
          inAmount
        ),
        SwapInstruction.exchange(
          this.poolAccount,
          this.authority,
          ephemeralKeypair.publicKey,
          this.tokenAccounts,
          userSourceTokenAccount,
          userDestinationTokenAccount,
          inAmount,
          minimumOutAmount
        ),
        Token.createRevokeInstruction(
          TOKEN_PROGRAM_ID,
          userSourceTokenAccount,
          user,
          []
        ),
      ]);
      return { instructions, signers: [ephemeralKeypair] };
    });
  }
  getOutAmount(sourceTokenMint, destinationTokenMint, inAmount) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.simulationUser) {
        throw new Error("Simulation user is empty");
      }
      if (!this.connection) {
        throw new Error("Connection is not defined");
      }
      const kp1 = Keypair.generate();
      const kp2 = Keypair.generate();
      // We use new fresh token accounts so we don't need the user to have any to simulate
      const instructions = [
        SystemProgram.createAccount({
          fromPubkey: this.simulationUser,
          newAccountPubkey: kp1.publicKey,
          lamports: RENT_EXEMPT_TOKEN_ACCOUNT_LAMPORTS,
          space: AccountLayout.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitAccountInstruction(
          TOKEN_PROGRAM_ID,
          sourceTokenMint,
          kp1.publicKey,
          this.simulationUser
        ),
        SystemProgram.createAccount({
          fromPubkey: this.simulationUser,
          newAccountPubkey: kp2.publicKey,
          lamports: RENT_EXEMPT_TOKEN_ACCOUNT_LAMPORTS,
          space: AccountLayout.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitAccountInstruction(
          TOKEN_PROGRAM_ID,
          destinationTokenMint,
          kp2.publicKey,
          this.simulationUser
        ),
        SwapInstruction.exchange(
          this.poolAccount,
          this.authority,
          this.simulationUser,
          this.tokenAccounts,
          kp1.publicKey,
          kp2.publicKey,
          inAmount,
          new BN(0)
        ),
      ];
      const { value } = yield this.connection.simulateTransaction(
        new Transaction({ feePayer: this.simulationUser }).add(...instructions)
      );
      const result = findLogAndParse(
        value === null || value === void 0 ? void 0 : value.logs,
        "GetDyUnderlying"
      );
      if (!result) {
        throw new Error("Failed to fetch out amount");
      }
      return result.dy;
    });
  }
  getMintAmount(depositAmounts) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.simulationUser) {
        throw new Error("Simulation user is empty");
      }
      if (!this.simulationTokenAccounts) {
        throw new Error("Simulation accounts are empty");
      }
      if (!this.connection) {
        throw new Error("Connection is not defined");
      }
      const instructions = [
        SwapInstruction.addLiquidity(
          this.poolAccount,
          this.authority,
          this.simulationUser,
          this.tokenAccounts,
          this.poolTokenMint,
          this.simulationTokenAccounts.tokenAccounts,
          this.simulationTokenAccounts.tokenAccountLP,
          depositAmounts,
          new BN(0)
        ),
      ];
      const { value } = yield this.connection.simulateTransaction(
        new Transaction({ feePayer: this.simulationUser }).add(...instructions)
      );
      const result = findLogAndParseWithRegex(
        value === null || value === void 0 ? void 0 : value.logs,
        new RegExp('GetMintAmount: {"mintAmount": (.+)}', "i")
      );
      if (!result) {
        throw new Error("Failed to fetch mint amount");
      }
      return result;
    });
  }
  getWithdrawalAmounts(unmintAmount) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.simulationUser) {
        throw new Error("Simulation user is empty");
      }
      if (!this.simulationTokenAccounts) {
        throw new Error("Simulation accounts are empty");
      }
      if (!this.connection) {
        throw new Error("Connection is not defined");
      }
      const instructions = [
        SwapInstruction.removeLiquidity(
          this.poolAccount,
          this.authority,
          this.simulationUser,
          this.tokenAccounts,
          this.poolTokenMint,
          this.simulationTokenAccounts.tokenAccounts,
          this.simulationTokenAccounts.tokenAccountLP,
          unmintAmount,
          [new BN(0), new BN(0), new BN(0)]
        ),
      ];
      const { value } = yield this.connection.simulateTransaction(
        new Transaction({ feePayer: this.simulationUser }).add(...instructions)
      );
      const result = findLogAndParse(
        value === null || value === void 0 ? void 0 : value.logs,
        "GetWithdrawalAmounts"
      );
      if (!result) {
        throw new Error("Failed to fetch withdrawal amounts");
      }
      return result;
    });
  }
  getWithdrawalAmount(destinationTokenMint, unmintAmount) {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.simulationUser) {
        throw new Error("Simulation user is empty");
      }
      if (!this.simulationTokenAccounts) {
        throw new Error("Simulation accounts are empty");
      }
      if (!this.connection) {
        throw new Error("Connection is not defined");
      }
      const tokenIndex = this.tokenMints.findIndex((tokenMint) =>
        destinationTokenMint.equals(tokenMint)
      );
      if (tokenIndex < 0) {
        throw new Error(
          `Failed to find ${destinationTokenMint.toBase58()} in tokenMints`
        );
      }
      const instructions = [
        SwapInstruction.removeLiquidityOneToken(
          this.poolAccount,
          this.authority,
          this.simulationUser,
          this.tokenAccounts,
          this.poolTokenMint,
          this.simulationTokenAccounts.tokenAccounts[tokenIndex],
          this.simulationTokenAccounts.tokenAccountLP,
          unmintAmount,
          new BN(0)
        ),
      ];
      const { value } = yield this.connection.simulateTransaction(
        new Transaction({ feePayer: this.simulationUser }).add(...instructions)
      );
      const result = findLogAndParse(
        value === null || value === void 0 ? void 0 : value.logs,
        "GetWithdrawalAmount"
      );
      if (!result) {
        throw new Error("Failed to fetch withdrawal amount");
      }
      return result;
    });
  }
  getVirtualPrice() {
    return __awaiter(this, void 0, void 0, function* () {
      if (!this.simulationUser) {
        throw new Error("Simulation user is empty");
      }
      if (!this.connection) {
        throw new Error("Connection is not defined");
      }
      const instructions = [
        SwapInstruction.getVirtualPrice(
          this.poolAccount,
          this.authority,
          this.simulationUser,
          this.tokenAccounts,
          this.poolTokenMint
        ),
      ];
      const { value } = yield this.connection.simulateTransaction(
        new Transaction({ feePayer: this.simulationUser }).add(...instructions)
      );
      const result = findLogAndParse(
        value === null || value === void 0 ? void 0 : value.logs,
        "GetVirtualPrice"
      );
      if (!result) {
        throw new Error("Failed to fetch virtual price");
      }
      return result;
    });
  }
  /**
   * Setup simulation user, if payer is provided tries to create token accounts, otherwise assumes they are created
   */
  static setupSimulationUser(
    connection,
    simulationUser,
    tokenMints,
    poolTokenMint,
    payer
  ) {
    return __awaiter(this, void 0, void 0, function* () {
      if (payer) {
        // Fund the system program account to avoid early failures
        const transferIx = SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: simulationUser,
          lamports: 100000000,
        });
        const signature = yield connection.sendTransaction(
          new Transaction().add(transferIx),
          [payer],
          {
            skipPreflight: true,
          }
        );
        yield connection.confirmTransaction(signature, "confirmed");
        // Create necessary accounts if they do not exist
        const tokenAccounts = yield Promise.all(
          tokenMints.map((tokenMint) =>
            __awaiter(this, void 0, void 0, function* () {
              const token = new Token(
                connection,
                tokenMint,
                TOKEN_PROGRAM_ID,
                payer
              );
              const accountInfo = yield token.getOrCreateAssociatedAccountInfo(
                simulationUser
              );
              return accountInfo.address;
            })
          )
        );
        const tokenLP = new Token(
          connection,
          poolTokenMint,
          TOKEN_PROGRAM_ID,
          payer
        );
        return {
          tokenAccounts,
          tokenAccountLP: (yield tokenLP.getOrCreateAssociatedAccountInfo(
            simulationUser
          )).address,
        };
      } else {
        return {
          tokenAccounts: yield Promise.all(
            tokenMints.map((tokenMint) =>
              Token.getAssociatedTokenAddress(
                ASSOCIATED_TOKEN_PROGRAM_ID,
                TOKEN_PROGRAM_ID,
                tokenMint,
                simulationUser
              )
            )
          ),
          tokenAccountLP: yield Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            poolTokenMint,
            simulationUser
          ),
        };
      }
    });
  }
  static getTokenAccountMint(connection, publicKey, cache = false) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
      if (cache) {
        const allTokenMints = tokenMints;
        const tokenMint = allTokenMints[publicKey.toBase58()];
        if (tokenMint) {
          return new PublicKey(tokenMint);
        }
      }
      const accountInfoData =
        (_a = yield connection.getAccountInfo(publicKey)) === null ||
        _a === void 0
          ? void 0
          : _a.data;
      if (!accountInfoData) {
        throw new Error(`Missing pool token account ${publicKey.toBase58()}`);
      }
      return new PublicKey(AccountLayout.decode(accountInfoData).mint);
    });
  }
  static getTokenAccountMintAsync(publicKey) {
    const allTokenMints = tokenMints;
    const tokenMint = allTokenMints[publicKey.toBase58()];
    if (!tokenMint) {
      throw new Error("Token mint does not exist in token-mints.json");
    }
    return new PublicKey(tokenMint);
  }
}
export function findLogAndParse(logs, name) {
  // State of the art solana methodology to consume return values
  const re = new RegExp(`${name}: (\\{.+\\})`, "i");
  let result;
  logs === null || logs === void 0
    ? void 0
    : logs.find((log) => {
        const match = log.match(re);
        if (
          (match === null || match === void 0 ? void 0 : match.length) === 2
        ) {
          result = JSON.parse(match[1]);
        }
        return match;
      });
  if (!result) {
    return null;
  }
  return result;
}
export function findLogAndParseWithRegex(logs, re) {
  let result;
  logs === null || logs === void 0
    ? void 0
    : logs.find((log) => {
        const match = log.match(re);
        if (
          (match === null || match === void 0 ? void 0 : match.length) === 2
        ) {
          result = new BN(match[1]);
        }
        return match;
      });
  if (!result) {
    return null;
  }
  return result;
}
export function getSimulateSwapInstructions(
  hgPool,
  inKey,
  outKey,
  simulationUser,
  inAmount
) {
  const RENT_EXEMPT_TOKEN_ACCOUNT_LAMPORTS = 2039280;

  const kp1 = Keypair.generate();
  const kp2 = Keypair.generate();

  return [
    SystemProgram.createAccount({
      fromPubkey: simulationUser,
      newAccountPubkey: kp1.publicKey,
      lamports: RENT_EXEMPT_TOKEN_ACCOUNT_LAMPORTS,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      inKey,
      kp1.publicKey,
      simulationUser
    ),
    SystemProgram.createAccount({
      fromPubkey: simulationUser,
      newAccountPubkey: kp2.publicKey,
      lamports: RENT_EXEMPT_TOKEN_ACCOUNT_LAMPORTS,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      outKey,
      kp2.publicKey,
      simulationUser
    ),
    instructions_1.SwapInstruction.exchange(
      hgPool.poolAccount,
      hgPool.authority,
      simulationUser,
      hgPool.tokenAccounts,
      kp1.publicKey,
      kp2.publicKey,
      inAmount,
      new BN(0)
    ),
  ];
}
//# sourceMappingURL=index.js.map
