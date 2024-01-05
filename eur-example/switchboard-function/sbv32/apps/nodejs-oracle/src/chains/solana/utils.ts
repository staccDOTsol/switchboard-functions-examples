import * as anchor from "@coral-xyz/anchor";
import type { Connection, PublicKey } from "@solana/web3.js";
import type { Big } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";
import type LRU from "lru-cache";

// TODO(mgild): move this out of this file.
export async function getMultipleJobDefinitions(
  connection: Connection,
  keys: Array<PublicKey>,
  cache: LRU<string, OracleJob>
): Promise<Array<OracleJob>> {
  const b58Keys = keys.map((key) => {
    return key.toBase58();
  });
  const results = new Array(b58Keys.length).fill(null);
  const input: Array<PublicKey> = [];
  // Only fetch jobs not cached
  for (let i = 0; i < b58Keys.length; ++i) {
    const cachedJob: OracleJob | undefined = cache.get(b58Keys[i]);
    if (cachedJob === undefined) {
      // Mark this job as needing to be fetched.
      input.push(keys[i]);
    } else {
      results[i] = cachedJob;
    }
  }
  let out: Array<OracleJob> = [];
  // Only fetch accounts if needed.
  if (input.length !== 0) {
    const accounts = await anchor.utils.rpc.getMultipleAccounts(
      connection,
      input
    );
    out = accounts.map((val) => {
      if (val === null) {
        throw new Error("InvalidJobAccountDataException");
      }
      return OracleJob.decodeDelimited(val.account.data.slice(1));
    });
  }
  // Fill results that couldn't be filled by the jobCache.
  let outIdx = 0;
  for (let i = 0; i < b58Keys.length; ++i) {
    if (results[i] === null) {
      results[i] = out[outIdx++];
      cache.set(b58Keys[i], results[i]);
    }
  }
  if (outIdx !== out.length) {
    throw new Error("Job fetch resolution length mismatch");
  }
  return results;
}

/**
 * Parameters for which oracles must submit for responding to update requests.
 */
export interface AggregatorSaveResultParams {
  /**
   *  Index in the list of oracles in the aggregator assigned to this round update.
   */
  oracleIdx: number;
  /**
   *  Reports that an error occured and the oracle could not send a value.
   */
  error: boolean;
  /**
   *  Value the oracle is responding with for this update.
   */
  value: Big;
  /**
   *  The minimum value this oracle has seen this round for the jobs listed in the
   *  aggregator.
   */
  minResponse: Big;
  /**
   *  The maximum value this oracle has seen this round for the jobs listed in the
   *  aggregator.
   */
  maxResponse: Big;
  /**
   *  List of protos.OracleJobs that were performed to produce this result.
   */
  jobs: Array<OracleJob>;
  /**
   *  Authority of the queue the aggregator is attached to.
   */
  queueAuthority: PublicKey;
  /**
   *  Program token mint.
   */
  tokenMint: PublicKey;
  /**
   *  List of parsed oracles.
   */
  oracles: Array<any>;
}
