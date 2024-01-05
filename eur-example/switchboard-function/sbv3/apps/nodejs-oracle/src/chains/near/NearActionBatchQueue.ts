import { NearAccessKey } from "./NearAccessKey";

import type {
  CrankAccount,
  OracleAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/near.js";
import {
  handleReceipt,
  SwitchboardTransaction,
  types,
} from "@switchboard-xyz/near.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import _ from "lodash";
import type { KeyPair } from "near-api-js";
import type { FinalExecutionOutcome } from "near-api-js/lib/providers";
import type { Action } from "near-api-js/lib/transaction";

export const NUMBER_OF_OPEN_ROUND_ACCESS_KEYS: number = Number.parseInt(
  process.env.NEAR_ACCESS_KEY_QUEUE_SIZE ?? "10"
);

interface ICachedAction {
  name: string;
  action: Action;
  callback: (name: string, txnReceipt: FinalExecutionOutcome) => Promise<void>;
  onFailure: (name: string, txnReceipt: FinalExecutionOutcome) => Promise<void>;
}

export class NearActionBatchQueue extends SwitchboardRoutine {
  eventName = "SendNearActions";

  private accessKeyIdx = 0;

  errorHandler = async (error) => {
    NodeLogger.getInstance().error(`Failed to send actions, ${error}`);
  };
  successHandler = undefined;
  retryInterval = 0;

  actions: Map<string, ICachedAction> = new Map();

  constructor(
    readonly program: SwitchboardProgram,
    private readonly _keys: NearAccessKey[]
  ) {
    super(1000);
  }

  get size(): number {
    return this._keys.length;
  }

  send(
    address: string,
    name: string,
    action: Action,
    callback: (
      name: string,
      txnReceipt: FinalExecutionOutcome
    ) => Promise<void>,
    onFailure: (
      name: string,
      txnReceipt: FinalExecutionOutcome
    ) => Promise<void>
  ) {
    if (this.actions.has(address)) {
      NodeLogger.getInstance().debug(
        `Near Queue already contains address ${address}, replacing`
      );
    }
    this.actions.set(address, { action, name, callback, onFailure });
  }

  get key(): NearAccessKey {
    const idx = this.accessKeyIdx;
    this.accessKeyIdx = (idx + 1) % this._keys.length;
    const key = this._keys[idx];
    key.requested();

    return key;
  }

  static async load(
    account: OracleAccount | CrankAccount,
    authority: KeyPair,
    size = NUMBER_OF_OPEN_ROUND_ACCESS_KEYS
  ): Promise<NearActionBatchQueue> {
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

    return new NearActionBatchQueue(account.program, keypairs);
  }

  routine = async () => {
    if (this.actions.size === 0) {
      return;
    }

    const actions = [...this.actions];
    const batches = _.chunk(actions, 10);

    // send in parallel
    await Promise.all(
      batches.map(async (batch) => {
        // send txn
        const accessKey = this.key;
        const txn = new SwitchboardTransaction(
          this.program.programId,
          this.program.account,
          batch.map((n) => n[1].action)
        );
        const txnReceipt = await txn.send(accessKey.keypair);

        const result = handleReceipt(txnReceipt);

        // IMPORTANT: we must await these or else we will end up double sending
        if (result instanceof types.SwitchboardError) {
          for await (const n of batch) {
            await n[1].onFailure(n[0], txnReceipt).catch();
          }
        }
        for await (const n of batch) {
          this.actions.delete(n[0]);
          await n[1].callback(n[0], txnReceipt).catch();
        }
      })
    );
  };
}
