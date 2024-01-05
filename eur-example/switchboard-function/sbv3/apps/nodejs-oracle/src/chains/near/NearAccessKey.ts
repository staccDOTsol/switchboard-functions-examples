import { Keypair } from "@solana/web3.js";
import { bs58 } from "@switchboard-xyz/common";
import type {
  CrankAccount,
  OracleAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/near.js";
import { SwitchboardTransaction } from "@switchboard-xyz/near.js";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import assert from "assert";
import crypto from "crypto";
import type { KeyPair } from "near-api-js";
import { utils } from "near-api-js";
import type { FinalExecutionOutcome } from "near-api-js/lib/providers";
import type { Action } from "near-api-js/lib/transaction";
import { KeyPairEd25519 } from "near-api-js/lib/utils";

export const NUMBER_OF_ACCESS_KEYS: number = Number.parseInt(
  process.env.NEAR_NUMBER_OF_ACCESS_KEYS ?? "100"
);

// https://nomicon.io/DataStructures/Account#account-id-rules
export const pubkeyStringToHex = (pubkeyString: string): string => {
  return Buffer.from(utils.PublicKey.fromString(pubkeyString).data).toString(
    "hex"
  );
};

export class NearAccessKey {
  lastRequested: number | undefined = undefined;

  constructor(readonly keypair: KeyPair, readonly nonce: number) {}

  get publicKey() {
    return this.keypair.getPublicKey();
  }

  get pubkey() {
    return this.publicKey.toString();
  }

  get hexPubkey() {
    return pubkeyStringToHex(this.pubkey);
  }

  requested() {
    this.lastRequested = Date.now();
  }

  isStale(timeout = 5000) {
    if (Date.now() - (this.lastRequested ?? 0) > timeout) {
      return false;
    }
    return true;
  }

  private static deriveSeed(
    authority: KeyPair,
    nonce: number,
    programId: string,
    oracleKey: string,
    baseSeed = "Sbv2NearOracleSaveResultAccessKey"
  ): Uint8Array {
    // authority.toString() -> ed25519:private_key
    const seed = `${baseSeed}-${programId}-${oracleKey}-${authority.toString()}-${nonce
      .toString()
      .padStart(5, "0")}`;
    const seedHashBuffer = crypto.createHash("sha256").update(seed).digest();
    assert(seedHashBuffer.byteLength === 32);
    return new Uint8Array(seedHashBuffer);
  }

  static deriveKeypair(
    authority: KeyPair,
    nonce: number,
    account: OracleAccount | CrankAccount
  ): KeyPair {
    const keypair = Keypair.fromSeed(
      NearAccessKey.deriveSeed(
        authority,
        nonce,
        bs58.encode(account.address),
        account.program.programId
      )
    );
    return new KeyPairEd25519(bs58.encode(keypair.secretKey));
  }
}

export class NearAccessKeyQueue {
  private accessKeyIdx = 0;

  constructor(
    readonly program: SwitchboardProgram,
    private readonly _keys: NearAccessKey[]
  ) {}

  get size(): number {
    return this._keys.length;
  }

  get key(): NearAccessKey {
    const idx = this.accessKeyIdx;
    this.accessKeyIdx = (idx + 1) % this._keys.length;
    const key = this._keys[idx];
    // if (key.isStale()) {
    //   throw new Error(`AccessKeyStale`);
    // }
    key.requested();

    return key;
  }

  static async load(
    account: OracleAccount | CrankAccount,
    authority: KeyPair,
    size = NUMBER_OF_ACCESS_KEYS
  ): Promise<NearAccessKeyQueue> {
    const keypairs: NearAccessKey[] = [];
    const currentAccessKeys = await account.program.account.getAccessKeys();
    for await (const nonce of Array.from({ length: size }, (_, i) => i + 1)) {
      const keypair = NearAccessKey.deriveKeypair(authority, nonce, account);
      const pubkey = keypair.getPublicKey().toString();
      const keypairIdx = currentAccessKeys.findIndex((accessKey) => {
        if (
          accessKey.public_key === pubkey &&
          accessKey.access_key.permission === "FullAccess"
        ) {
          return true;
        }
        return false;
      });

      if (keypairIdx === -1) {
        // TODO: make Switchboard method specific access key
        await account.program.account.addKey(keypair.getPublicKey());
      }

      keypairs.push(new NearAccessKey(keypair, nonce));
    }

    return new NearAccessKeyQueue(account.program, keypairs);
  }

  public async send(action: Action): Promise<FinalExecutionOutcome> {
    try {
      const accessKey = this.key;
      const txn = new SwitchboardTransaction(
        this.program.programId,
        this.program.account,
        [action]
      );
      const txnReceipt = await txn.send(accessKey.keypair);
      return txnReceipt;
    } catch (error) {
      NodeLogger.getInstance().error((error as any).toString());
      const txnReceipt = await this.program.sendAction(action);
      return txnReceipt;
    }
  }
}
