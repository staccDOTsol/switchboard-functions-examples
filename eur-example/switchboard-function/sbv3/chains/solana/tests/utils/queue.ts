import type { SwitchboardAttestationProgram } from "../../target/types/switchboard_attestation_program";

import {
  getDerivedKeypair,
  getOrCreateProgramStateInstruction,
  unixTimestampBN,
} from "./utils";

import type { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { TransactionInstruction } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { parseRawMrEnclave } from "@switchboard-xyz/common";
import {
  type AnchorWallet,
  parseRawBuffer,
  TransactionObject,
} from "@switchboard-xyz/solana.js";

const qvnMrEnclave = parseRawMrEnclave("MadeUpQvnMrEnclave", true);

interface FunctionVerifyAccounts {
  // TODO: remove soon, function_verify expects verifier while the rest expect verifier_quote
  verifier: PublicKey;

  // Request/Routine expect verifierQuote
  verifierQuote: PublicKey;
  verifierEnclaveSigner: PublicKey;
  verifierPermission: PublicKey;
}

export class FunctionVerifier {
  constructor(
    public readonly keypair: Keypair,
    public readonly signer: Keypair,
    public readonly permissions: PublicKey
  ) {}

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  public getAccounts(): FunctionVerifyAccounts {
    return {
      verifier: this.publicKey,
      verifierQuote: this.publicKey,
      verifierEnclaveSigner: this.signer.publicKey,
      verifierPermission: this.permissions,
    };
  }
}

interface CreateAttestationQueueArgs {
  attestationQueueKeypair: Keypair;
  authority?: Keypair;

  params?: Partial<QueueInitParams> & { numVerifiers?: 1 };

  // this determines the number of verifiers to initialize
  verifiers: {
    keypair: Keypair;
    signerKeypair: Keypair;
  }[];
}

interface QueueInitParams {
  reward: number;
  allowAuthorityOverrideAfter: number;
  maxQuoteVerificationAge: number;
  nodeTimeout: number;
  requireAuthorityHeartbeatPermission: boolean;
  requireUsagePermissions: boolean;
}

const DEFAULT_QUEUE_PARAMS: QueueInitParams = {
  reward: 0,
  allowAuthorityOverrideAfter: 300,
  maxQuoteVerificationAge: 604800,
  nodeTimeout: 604800,
  requireAuthorityHeartbeatPermission: false,
  requireUsagePermissions: false,
};

/**
 * Represents a queue of function verifiers used by the Switchboard Attestation Program.
 */
export class SwitchboardAttestationQueue {
  /**
   * @param publicKey - The public key of the queue.
   * @param authority - The public key of the authority.
   * @param verifiers - An array of function verifiers.
   */
  constructor(
    public readonly publicKey: PublicKey,
    public readonly authority: PublicKey,
    public readonly verifiers: FunctionVerifier[]
  ) {}

  /**
   * Return the function verifier for a given idx on the queue.
   * This method is intended for testing purposes only and is used to
   * mimic the behavior of the Switchboard Attestation Program.
   * @param queueIdx - The index of the queue.
   * @returns The function verifier for the given index.
   * @throws An error if the verifier for the given index is not found.
   */
  public getVerifier(queueIdx: number): FunctionVerifier {
    const idx = queueIdx % this.verifiers.length;
    const verifier = this.verifiers[idx];
    if (!verifier) {
      throw new Error(`Failed to find verifier for queue ${queueIdx}`);
    }

    return verifier;
  }

  /**
   * Return the accounts needed to build a function verify instruction.
   * @param queueIdx - The index of the queue.
   * @returns The accounts needed to build a function verify instruction.
   */
  public getVerifierAccounts(queueIdx: number): FunctionVerifyAccounts {
    const verifier = this.getVerifier(queueIdx);
    return verifier.getAccounts();
  }

  public static async getOrCreate(
    program: Program<SwitchboardAttestationProgram>,
    args: CreateAttestationQueueArgs | number = 2,
    queueMrEnclave: Uint8Array = qvnMrEnclave
  ): Promise<SwitchboardAttestationQueue> {
    const provider = program.provider as AnchorProvider;
    const payer = (provider.wallet as AnchorWallet).payer;

    const authority = payer;

    const queueInitParams: QueueInitParams =
      args !== undefined && typeof args !== "number"
        ? { ...DEFAULT_QUEUE_PARAMS, ...args.params }
        : { ...DEFAULT_QUEUE_PARAMS };

    let attestationQueueKeypair: Keypair;

    const verifiers: FunctionVerifier[] = [];

    if (args === undefined || typeof args === "number") {
      // derive defaults
      attestationQueueKeypair =
        SwitchboardAttestationQueue.getDefaultAttestationQueueKeypair(
          payer.secretKey
        );

      verifiers.push(
        ...Array.from(
          { length: Math.max(1, Math.abs(args as number)) },
          (v, k) => k
        ).map((idx) => {
          const keypair = SwitchboardAttestationQueue.getVerifierKeypair(
            payer.secretKey,
            idx
          );
          const signerKeypair =
            SwitchboardAttestationQueue.getVerifierSignerKeypair(
              payer.secretKey,
              idx
            );
          const permission = PublicKey.findProgramAddressSync(
            [
              Buffer.from("PermissionAccountData"),
              authority.publicKey.toBytes(),
              attestationQueueKeypair.publicKey.toBytes(),
              keypair.publicKey.toBytes(),
            ],
            program.programId
          )[0];

          return new FunctionVerifier(keypair, signerKeypair, permission);
        })
      );
    } else {
      // create new queue or hash params to derive keypair for existing queue
      attestationQueueKeypair =
        args.attestationQueueKeypair ?? Keypair.generate();

      const numVerifiers = Math.max(1, args?.params?.numVerifiers ?? 1);

      const verifiersWithKeypairs = [...(args?.verifiers ?? [])];

      let numMissingVerifiers = Math.max(
        0,
        numVerifiers - verifiersWithKeypairs.length
      );

      while (numMissingVerifiers > 0) {
        verifiersWithKeypairs.push({
          keypair: Keypair.generate(),
          signerKeypair: Keypair.generate(),
        });
        numMissingVerifiers--;
      }

      verifiers.push(
        ...verifiersWithKeypairs.map((v) => {
          const keypair = v.keypair;
          const signerKeypair = v.signerKeypair;
          const permission = PublicKey.findProgramAddressSync(
            [
              Buffer.from("PermissionAccountData"),
              authority.publicKey.toBytes(),
              attestationQueueKeypair.publicKey.toBytes(),
              keypair.publicKey.toBytes(),
            ],
            program.programId
          )[0];

          return new FunctionVerifier(keypair, signerKeypair, permission);
        })
      );
    }

    const attestationQueue = attestationQueueKeypair.publicKey;
    const bootstrappedVerifier = verifiers[0];
    if (!bootstrappedVerifier) {
      throw new Error(`Unexpected`);
    }

    const keypairs = [authority];

    const ixns: TransactionInstruction[] = [];

    // PROGRAM STATE INIT
    const stateInitIxn = await getOrCreateProgramStateInstruction(program);
    if (stateInitIxn) {
      ixns.push(stateInitIxn);
    }

    const [queueAccountData, verifierAccountData] =
      await provider.connection.getMultipleAccountsInfo([
        attestationQueueKeypair.publicKey,
        bootstrappedVerifier.publicKey,
      ]);

    if (queueAccountData === null) {
      if (verifierAccountData !== null) {
        throw new Error(
          `Queue account does not exists but verifier account does, unexpected ...`
        );
      }

      keypairs.push(
        attestationQueueKeypair,
        bootstrappedVerifier.keypair,
        bootstrappedVerifier.signer
      );

      ixns.push(
        ...[
          // QUEUE INIT
          await program.methods
            .attestationQueueInit(queueInitParams)
            .accounts({
              queue: attestationQueue,
              authority: authority.publicKey,
              payer: payer.publicKey,
            })
            .instruction(),
          // attestationQueueAddMrEnclave
          await program.methods
            .attestationQueueAddMrEnclave({
              mrEnclave: Array.from(queueMrEnclave),
            })
            .accounts({
              queue: attestationQueue,
              authority: authority.publicKey,
            })
            .instruction(),

          // BOOTSTRAPPED VERIFIER
          // verifierInit
          await program.methods
            .verifierInit({})
            .accounts({
              verifier: bootstrappedVerifier.publicKey,
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
              permission: bootstrappedVerifier.permissions,
              attestationQueue: attestationQueue,
              node: bootstrappedVerifier.publicKey,
              authority: authority.publicKey,
              payer: payer.publicKey,
            })
            .instruction(),
          // attestationPermissionSet
          await program.methods
            .attestationPermissionSet({ permission: 1, enable: true })
            .accounts({
              permission: bootstrappedVerifier.permissions,
              authority: authority.publicKey,
              attestationQueue: attestationQueue,
              grantee: bootstrappedVerifier.publicKey,
            })
            .instruction(),
          // set oracles secure signer
          await program.methods
            .verifierQuoteRotate({
              registryKey: Array.from(parseRawBuffer("registryKey", 64)),
            })
            .accounts({
              verifier: bootstrappedVerifier.publicKey,
              authority: authority.publicKey,
              enclaveSigner: bootstrappedVerifier.signer.publicKey,
              attestationQueue: attestationQueue,
            })
            .instruction(),
          // verifier oracle heartbeat to signal readiness
          await program.methods
            .verifierHeartbeat({})
            .accounts({
              verifier: bootstrappedVerifier.publicKey,
              verifierSigner: bootstrappedVerifier.signer.publicKey,
              attestationQueue: attestationQueue,
              queueAuthority: authority.publicKey,
              gcNode: bootstrappedVerifier.publicKey,
              permission: bootstrappedVerifier.permissions,
            })
            .instruction(),
        ]
      );
    }

    // TODO: batch into a single rpc call
    for await (const verifier of verifiers.slice(1)) {
      const verifierAccountInfo = await provider.connection.getAccountInfo(
        verifier.publicKey
      );
      if (verifierAccountInfo === null) {
        keypairs.push(verifier.keypair, verifier.signer);

        ixns.push(
          // verifierInit
          await program.methods
            .verifierInit({})
            .accounts({
              verifier: verifier.publicKey,
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
              permission: verifier.permissions,
              attestationQueue: attestationQueue,
              node: verifier.publicKey,
              authority: authority.publicKey,
              payer: payer.publicKey,
            })
            .instruction(),
          // attestationPermissionSet
          await program.methods
            .attestationPermissionSet({ permission: 1, enable: true })
            .accounts({
              permission: verifier.permissions,
              authority: authority.publicKey,
              attestationQueue: attestationQueue,
              grantee: verifier.publicKey,
            })
            .instruction(),
          // set oracles secure signer
          await program.methods
            .verifierQuoteRotate({
              registryKey: Array.from(parseRawBuffer("registryKey", 64)),
            })
            .accounts({
              verifier: verifier.publicKey,
              authority: authority.publicKey,
              enclaveSigner: verifier.signer.publicKey,
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
              quote: verifier.publicKey,
              verifier: bootstrappedVerifier.publicKey,
              enclaveSigner: bootstrappedVerifier.signer.publicKey,
              attestationQueue: attestationQueue,
            })
            .instruction(),
          // verifier oracle heartbeat to signal readiness
          await program.methods
            .verifierHeartbeat({})
            .accounts({
              verifier: verifier.publicKey,
              verifierSigner: verifier.signer.publicKey,
              attestationQueue: attestationQueue,
              queueAuthority: authority.publicKey,
              gcNode: verifier.publicKey,
              permission: verifier.permissions,
            })
            .instruction()
        );
      }
    }

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

    if (process.env.DEBUG || process.env.VERBOSE) {
      console.log(
        `[TX] Attestation Queue Init:\n\t${signatures
          .map((s, i) => `#${i + 1} - ${s}`)
          .join("\n\t")}`
      );
    }

    // re-add the bootstrapped verifier
    // verifiers.unshift(bootstrappedVerifier);

    const queue = new SwitchboardAttestationQueue(
      attestationQueueKeypair.publicKey,
      authority.publicKey,
      verifiers
    );

    return queue;
  }

  private static getDefaultAttestationQueueKeypair(
    secretKey: Uint8Array,
    name = "DefaultAttestationQueue"
  ): Keypair {
    return getDerivedKeypair(`SbTesting-${name}`, secretKey);
  }

  private static getVerifierKeypair(
    secretKey: Uint8Array,
    idx = 0,
    name = "DefaultAttestationQueueVerifier"
  ): Keypair {
    return getDerivedKeypair(`SbTesting-${name}-idx-${idx}`, secretKey);
  }

  private static getVerifierSignerKeypair(
    secretKey: Uint8Array,
    idx = 0,
    name = "DefaultAttestationQueueSigner"
  ): Keypair {
    return getDerivedKeypair(`SbTesting-${name}-idx-${idx}`, secretKey);
  }
}
