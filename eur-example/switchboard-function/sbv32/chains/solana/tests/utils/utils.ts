import type { SwitchboardAttestationProgram } from "../../target/types/switchboard_attestation_program";

import type { AnchorProvider, Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import type {
  Connection,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN, parseRawMrEnclave, sleep } from "@switchboard-xyz/common";
import {
  type AnchorWallet,
  parseRawBuffer,
  TransactionObject,
} from "@switchboard-xyz/solana.js";
import crypto from "crypto";

export function debugLog(...msg: string[]) {
  if (process.env.DEBUG || process.env.VERBOSE) {
    console.log(...msg);
  }
}

export function unixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function unixTimestampBN(): BN {
  return new BN(unixTimestamp());
}

const addressLookupProgram = new PublicKey(
  "AddressLookupTab1e1111111111111111111111111"
);
export const nativeMint = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

const qvnMrEnclave = parseRawMrEnclave("MadeUpQvnMrEnclave", true);
export const functionMrEnclave = parseRawMrEnclave(
  "MadeUpFunctionTestsMrEnclave",
  true
);

export async function isProgramInitialized(
  program: Program<SwitchboardAttestationProgram>
): Promise<boolean> {
  const programStateAccountInfo =
    await program.provider.connection.getAccountInfo(
      PublicKey.findProgramAddressSync(
        [Buffer.from("STATE")],
        program.programId
      )[0]
    );

  return programStateAccountInfo && programStateAccountInfo.data.length > 0;
}

export async function getOrCreateProgramStateInstruction(
  program: Program<SwitchboardAttestationProgram>
): Promise<TransactionInstruction | undefined> {
  if (await isProgramInitialized(program)) {
    return undefined;
  }

  const payer = ((program.provider as AnchorProvider).wallet as AnchorWallet)
    .payer;

  return await program.methods
    .stateInit({})
    .accounts({
      state: PublicKey.findProgramAddressSync(
        [Buffer.from("STATE")],
        program.programId
      )[0],
      payer: payer.publicKey,
    })
    .instruction();
}

export async function getOrCreateProgramState(
  program: Program<SwitchboardAttestationProgram>
) {
  if (await isProgramInitialized(program)) {
    return;
  }

  const payer = ((program.provider as AnchorProvider).wallet as AnchorWallet)
    .payer;

  const attestationProgramState = PublicKey.findProgramAddressSync(
    [Buffer.from("STATE")],
    program.programId
  )[0];

  const txn = await program.methods
    .stateInit({})
    .accounts({
      state: attestationProgramState,
      payer: payer.publicKey,
    })
    .rpc();
  debugLog(`[TX] stateInit: ${txn}`);
}

interface CreateAttestationQueueSigners {
  attestationQueueKeypair: Keypair;
  verifierOracleKeypair: Keypair;
  verifierSignerKeypair: Keypair;
  authority?: Keypair;
}

interface CreateAttestationQueueParams {
  reward?: number;
  allowAuthorityOverrideAfter?: number;
  maxQuoteVerificationAge?: number;
  nodeTimeout?: number;
  requireAuthorityHeartbeatPermission?: boolean;
  requireUsagePermissions?: boolean;
}

export async function createAttestationQueue(
  program: Program<SwitchboardAttestationProgram>,
  signers: CreateAttestationQueueSigners,
  params?: CreateAttestationQueueParams,
  queueMrEnclave: Uint8Array = qvnMrEnclave
): Promise<TransactionSignature> {
  const payer = ((program.provider as AnchorProvider).wallet as AnchorWallet)
    .payer;
  const authority = signers.authority ?? payer;

  const stateInitIxn = await getOrCreateProgramStateInstruction(program);
  // await getOrCreateProgramState(program);

  const attestationQueue = signers.attestationQueueKeypair.publicKey;
  const verifierOracle = signers.verifierOracleKeypair.publicKey;
  const verifierSigner = signers.verifierSignerKeypair.publicKey;
  const verifierPermissions = PublicKey.findProgramAddressSync(
    [
      Buffer.from("PermissionAccountData"),
      authority.publicKey.toBytes(),
      attestationQueue.toBytes(),
      verifierOracle.toBytes(),
    ],
    program.programId
  )[0];

  const txn = await program.methods
    .attestationQueueInit({
      reward: params?.reward ?? 0,
      allowAuthorityOverrideAfter: params?.allowAuthorityOverrideAfter ?? 300,
      maxQuoteVerificationAge: params?.maxQuoteVerificationAge ?? 604800,
      nodeTimeout: params?.nodeTimeout ?? 604800,
      requireAuthorityHeartbeatPermission:
        params?.requireAuthorityHeartbeatPermission ?? false,
      requireUsagePermissions: params?.requireUsagePermissions ?? false,
    })
    .accounts({
      queue: attestationQueue,
      authority: authority.publicKey,
      payer: payer.publicKey,
    })
    .signers([
      authority,
      signers.attestationQueueKeypair,
      signers.verifierOracleKeypair,
      signers.verifierSignerKeypair,
    ])
    .preInstructions(stateInitIxn ? [stateInitIxn] : [])
    .postInstructions([
      // attestationQueueAddMrEnclave
      await program.methods
        .attestationQueueAddMrEnclave({ mrEnclave: Array.from(queueMrEnclave) })
        .accounts({
          queue: attestationQueue,
          authority: authority.publicKey,
        })
        .instruction(),
      // verifierInit
      await program.methods
        .verifierInit({})
        .accounts({
          verifier: verifierOracle,
          attestationQueue: attestationQueue,
          queueAuthority: authority.publicKey,
          authority: authority.publicKey,
          payer: payer.publicKey,
        })
        .instruction(),
      // attestationPermissionInit
      await program.methods
        .attestationPermissionInit({})
        .accounts({
          permission: verifierPermissions,
          attestationQueue: attestationQueue,
          node: verifierOracle,
          authority: authority.publicKey,
          payer: payer.publicKey,
        })
        .instruction(),
      // attestationPermissionSet
      await program.methods
        .attestationPermissionSet({ permission: 1, enable: true })
        .accounts({
          permission: verifierPermissions,
          authority: authority.publicKey,
          attestationQueue: attestationQueue,
          grantee: verifierOracle,
        })
        .instruction(),
      // set oracles secure signer
      await program.methods
        .verifierQuoteRotate({
          registryKey: Array.from(parseRawBuffer("registryKey", 64)),
        })
        .accounts({
          verifier: verifierOracle,
          authority: authority.publicKey,
          enclaveSigner: verifierSigner,
          attestationQueue: attestationQueue,
        })
        .instruction(),
      // verifier oracle heartbeat to signal readiness
      await program.methods
        .verifierHeartbeat({})
        .accounts({
          verifier: verifierOracle,
          verifierSigner: verifierSigner,
          attestationQueue: attestationQueue,
          queueAuthority: authority.publicKey,
          gcNode: verifierOracle,
          permission: verifierPermissions,
        })
        .instruction(),
    ])
    .rpc();

  return txn;
}

///////////////////////////////////////////////////////////////////

interface CreateAttestationQueueSigners2 {
  attestationQueueKeypair: Keypair;
  verifierOracleKeypair1: Keypair;
  verifierSignerKeypair1: Keypair;
  verifierOracleKeypair2: Keypair;
  verifierSignerKeypair2: Keypair;
  authority?: Keypair;
}

interface CreateAttestationQueueParams2 {
  reward?: number;
  allowAuthorityOverrideAfter?: number;
  maxQuoteVerificationAge?: number;
  nodeTimeout?: number;
  requireAuthorityHeartbeatPermission?: boolean;
  requireUsagePermissions?: boolean;
}

export async function createAttestationQueue2(
  program: Program<SwitchboardAttestationProgram>,
  signers: CreateAttestationQueueSigners2,
  params?: CreateAttestationQueueParams2,
  queueMrEnclave: Uint8Array = qvnMrEnclave
): Promise<TransactionSignature[]> {
  const provider = program.provider as AnchorProvider;
  const payer = (provider.wallet as AnchorWallet).payer;
  const authority = signers.authority ?? payer;

  const stateInitIxn = await getOrCreateProgramStateInstruction(program);

  const attestationQueue = signers.attestationQueueKeypair.publicKey;
  const verifierOracle1 = signers.verifierOracleKeypair1.publicKey;
  const verifierSigner1 = signers.verifierSignerKeypair1.publicKey;
  const verifierPermissions1 = PublicKey.findProgramAddressSync(
    [
      Buffer.from("PermissionAccountData"),
      authority.publicKey.toBytes(),
      attestationQueue.toBytes(),
      verifierOracle1.toBytes(),
    ],
    program.programId
  )[0];
  const verifierOracle2 = signers.verifierOracleKeypair2.publicKey;
  const verifierSigner2 = signers.verifierSignerKeypair2.publicKey;
  const verifierPermissions2 = PublicKey.findProgramAddressSync(
    [
      Buffer.from("PermissionAccountData"),
      authority.publicKey.toBytes(),
      attestationQueue.toBytes(),
      verifierOracle2.toBytes(),
    ],
    program.programId
  )[0];

  const keypairs = [
    authority,
    signers.attestationQueueKeypair,
    signers.verifierOracleKeypair1,
    signers.verifierSignerKeypair1,
    signers.verifierOracleKeypair2,
    signers.verifierSignerKeypair2,
  ];

  const ixns: TransactionInstruction[] = [
    // STATE INIT
    ...(stateInitIxn ? [stateInitIxn] : []),

    // QUEUE INIT
    await program.methods
      .attestationQueueInit({
        reward: params?.reward ?? 0,
        allowAuthorityOverrideAfter: params?.allowAuthorityOverrideAfter ?? 300,
        maxQuoteVerificationAge: params?.maxQuoteVerificationAge ?? 604800,
        nodeTimeout: params?.nodeTimeout ?? 604800,
        requireAuthorityHeartbeatPermission:
          params?.requireAuthorityHeartbeatPermission ?? false,
        requireUsagePermissions: params?.requireUsagePermissions ?? false,
      })
      .accounts({
        queue: attestationQueue,
        authority: authority.publicKey,
        payer: payer.publicKey,
      })
      .instruction(),
    // attestationQueueAddMrEnclave
    await program.methods
      .attestationQueueAddMrEnclave({ mrEnclave: Array.from(queueMrEnclave) })
      .accounts({
        queue: attestationQueue,
        authority: authority.publicKey,
      })
      .instruction(),

    // VERIFIER #1
    // verifierInit
    await program.methods
      .verifierInit({})
      .accounts({
        verifier: verifierOracle1,
        attestationQueue: attestationQueue,
        queueAuthority: authority.publicKey,
        authority: authority.publicKey,
        payer: payer.publicKey,
      })
      .instruction(),
    // attestationPermissionInit
    await program.methods
      .attestationPermissionInit({})
      .accounts({
        permission: verifierPermissions1,
        attestationQueue: attestationQueue,
        node: verifierOracle1,
        authority: authority.publicKey,
        payer: payer.publicKey,
      })
      .instruction(),
    // attestationPermissionSet
    await program.methods
      .attestationPermissionSet({ permission: 1, enable: true })
      .accounts({
        permission: verifierPermissions1,
        authority: authority.publicKey,
        attestationQueue: attestationQueue,
        grantee: verifierOracle1,
      })
      .instruction(),
    // set oracles secure signer
    await program.methods
      .verifierQuoteRotate({
        registryKey: Array.from(parseRawBuffer("registryKey", 64)),
      })
      .accounts({
        verifier: verifierOracle1,
        authority: authority.publicKey,
        enclaveSigner: verifierSigner1,
        attestationQueue: attestationQueue,
      })
      .instruction(),
    // verifier oracle heartbeat to signal readiness
    await program.methods
      .verifierHeartbeat({})
      .accounts({
        verifier: verifierOracle1,
        verifierSigner: verifierSigner1,
        attestationQueue: attestationQueue,
        queueAuthority: authority.publicKey,
        gcNode: verifierOracle1,
        permission: verifierPermissions1,
      })
      .instruction(),

    // VERIFIER #2
    // verifierInit
    await program.methods
      .verifierInit({})
      .accounts({
        verifier: verifierOracle2,
        attestationQueue: attestationQueue,
        queueAuthority: authority.publicKey,
        authority: authority.publicKey,
        payer: payer.publicKey,
      })
      .instruction(),
    // attestationPermissionInit
    await program.methods
      .attestationPermissionInit({})
      .accounts({
        permission: verifierPermissions2,
        attestationQueue: attestationQueue,
        node: verifierOracle2,
        authority: authority.publicKey,
        payer: payer.publicKey,
      })
      .instruction(),
    // attestationPermissionSet
    await program.methods
      .attestationPermissionSet({ permission: 1, enable: true })
      .accounts({
        permission: verifierPermissions2,
        authority: authority.publicKey,
        attestationQueue: attestationQueue,
        grantee: verifierOracle2,
      })
      .instruction(),
    // set oracles secure signer
    await program.methods
      .verifierQuoteRotate({
        registryKey: Array.from(parseRawBuffer("registryKey", 64)),
      })
      .accounts({
        verifier: verifierOracle2,
        authority: authority.publicKey,
        enclaveSigner: verifierSigner2,
        attestationQueue: attestationQueue,
      })
      .instruction(),
    await program.methods
      .verifierQuoteVerify({
        timestamp: unixTimestampBN(),
        mrEnclave: Array.from(queueMrEnclave),
        idx: 1,
      })
      .accounts({
        quote: verifierOracle2,
        verifier: verifierOracle1,
        enclaveSigner: verifierSigner1,
        attestationQueue: attestationQueue,
      })
      .instruction(),
    // verifier oracle heartbeat to signal readiness
    await program.methods
      .verifierHeartbeat({})
      .accounts({
        verifier: verifierOracle2,
        verifierSigner: verifierSigner2,
        attestationQueue: attestationQueue,
        queueAuthority: authority.publicKey,
        gcNode: verifierOracle2,
        permission: verifierPermissions2,
      })
      .instruction(),
  ];

  const packedTxns = TransactionObject.packIxns(
    payer.publicKey,
    ixns,
    keypairs
  );

  const signatures = await TransactionObject.signAndSendAll(
    provider,
    packedTxns,
    undefined,
    undefined,
    50
  );

  return signatures;
}

////////////////////////////////////////////////////////////////////

interface CreateFunctionParams {
  authority?: Keypair;
  walletAuthority?: Keypair;

  name?: string;
  metadata?: string;
  container?: string;
  containerRegistry?: string;
  version?: string;
  // schedule?: string;

  requestsDisabled?: boolean;
  requestsRequireAuthorization?: boolean;
  requestsFee?: number;

  routinesDisabled?: boolean;
  routinesRequireAuthorization?: boolean;
  routinesFee?: number;
}

export async function createFunction(
  program: Program<SwitchboardAttestationProgram>,
  attestationQueue: PublicKey,
  functionSeed: string,
  params?: CreateFunctionParams,
  sbWalletPubkey?: PublicKey,
  mrEnclave = functionMrEnclave
): Promise<[PublicKey, TransactionSignature]> {
  const signers = [];
  if (params?.authority) {
    signers.push(params?.authority);
  }

  const payer = ((program.provider as AnchorProvider).wallet as AnchorWallet)
    .payer;
  const authorityPubkey = params?.authority
    ? params?.authority.publicKey
    : payer.publicKey;

  // Derive our functions pubkey
  const recentSlot = new BN(
    (
      await program.provider.connection.getLatestBlockhashAndContext({
        commitment: "finalized",
      })
    ).context.slot
  );
  const creatorSeed = parseRawBuffer(functionSeed, 32);

  const functionPubkey = PublicKey.findProgramAddressSync(
    [
      Buffer.from("FunctionAccountData"),
      creatorSeed,
      recentSlot.toBuffer("le", 8),
    ],
    program.programId
  )[0];

  let walletPubkey: PublicKey;
  let walletAuthority: PublicKey | null = null;

  let tokenWallet: PublicKey;
  if (sbWalletPubkey) {
    walletPubkey = sbWalletPubkey;
    const walletState = await program.account.switchboardWallet.fetch(
      walletPubkey
    );
    if (!walletState.mint.equals(nativeMint)) {
      throw new Error(`SwitchboardWallet mint must be the native mint`);
    }

    tokenWallet = walletState.tokenWallet;

    if (params?.walletAuthority) {
      signers.push(params?.walletAuthority);
      walletAuthority = params.walletAuthority.publicKey;
    } else {
      walletAuthority = walletState.authority;
    }
  } else {
    if (params?.walletAuthority) {
      signers.push(params?.walletAuthority);
      walletAuthority = params.walletAuthority.publicKey;
    } else {
      walletAuthority = authorityPubkey;
    }

    walletPubkey = PublicKey.findProgramAddressSync(
      [
        nativeMint.toBytes(),
        attestationQueue.toBytes(),
        walletAuthority.toBytes(),
        functionPubkey.toBytes(), // name seed
      ],
      program.programId
    )[0];
    // walletAuthority = authorityPubkey;
    tokenWallet = anchor.utils.token.associatedAddress({
      mint: nativeMint,
      owner: walletPubkey,
    });
  }

  const [addressLookupTablePubkey] = PublicKey.findProgramAddressSync(
    [functionPubkey.toBuffer(), recentSlot.toBuffer("le", 8)],
    addressLookupProgram
  );

  const functionInit = await program.methods
    .functionInit({
      // PDA fields
      recentSlot: recentSlot,
      creatorSeed: Array.from(creatorSeed),

      // Metadata
      name: Buffer.from(params?.name ?? "FunctionRoutineTests"),
      metadata: Buffer.from(params?.metadata ?? "FunctionRoutineTests"),

      // Container Config
      container: Buffer.from(
        params?.container ?? "switchboardlabs/function-testing"
      ),
      containerRegistry: Buffer.from(params?.containerRegistry ?? "dockerhub"),
      version: Buffer.from(params?.version ?? "latest"),
      mrEnclave: Array.from(mrEnclave),

      // Request Conf
      requestsDisabled: params?.requestsDisabled ?? false,
      requestsRequireAuthorization:
        params?.requestsRequireAuthorization ?? false,
      requestsDevFee: new BN(params?.requestsFee ?? 0),

      // Routine Config
      routinesDisabled: params?.routinesDisabled ?? false,
      routinesRequireAuthorization:
        params?.routinesRequireAuthorization ?? false,
      routinesDevFee: new BN(params?.routinesFee ?? 0),
    })
    .accounts({
      function: functionPubkey,
      addressLookupTable: addressLookupTablePubkey,
      authority: authorityPubkey,
      attestationQueue: attestationQueue,
      payer: payer.publicKey,
      escrowWallet: walletPubkey,
      escrowWalletAuthority: walletAuthority,
      escrowTokenWallet: tokenWallet,
      mint: nativeMint,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      addressLookupProgram: addressLookupProgram,
    })
    .signers(signers)
    .rpc();

  return [functionPubkey, functionInit];
}

export function getSwitchboardWalletPubkeys(
  program: Program<SwitchboardAttestationProgram>,
  attestationQueue: PublicKey,
  authority: PublicKey,
  name?: string | PublicKey
): [PublicKey, PublicKey] {
  const rawNameBytes: Uint8Array =
    name instanceof PublicKey
      ? name.toBytes()
      : new Uint8Array(Buffer.from(name ?? "DefaultWallet"));

  const nameBytes = new Uint8Array(32);
  nameBytes.set(rawNameBytes);

  const escrowWalletPubkey = PublicKey.findProgramAddressSync(
    [
      nativeMint.toBytes(),
      attestationQueue.toBytes(),
      authority.toBytes(),
      nameBytes.slice(0, 32),
    ],
    program.programId
  )[0];

  const escrowTokenWalletPubkey = anchor.utils.token.associatedAddress({
    owner: escrowWalletPubkey,
    mint: nativeMint,
  });

  return [escrowWalletPubkey, escrowTokenWalletPubkey];
}

export async function printLogs(
  connection: Connection,
  tx: string,
  v0Txn: boolean = false,
  delay = 3000
) {
  if (delay > 0) {
    await sleep(delay);
  }

  const parsed = await connection.getParsedTransaction(tx, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: v0Txn ? 0 : undefined,
  });
  console.log(parsed?.meta?.logMessages?.join("\n"));
}

export function getDerivedKeypair(
  baseSeed: string,
  secretKey: Uint8Array
): Keypair {
  const seed = `${baseSeed}-${Buffer.from(secretKey).toString("hex")}`;
  const seedHash = crypto.createHash("sha256").update(seed).digest();
  return Keypair.fromSeed(seedHash.slice(0, 32));
}
