import * as anchor from "@coral-xyz/anchor";
import TTL from "@isaacs/ttlcache";
import { PublicKey } from "@solana/web3.js";
import type { Big } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";
import * as sbv2 from "@switchboard-xyz/solana.js";
import type LRU from "lru-cache";

interface FeedResult {
  pubkey: string;
  value: Big;
}

export class SwitchboardClient {
  private aggregatorCache: TTL<string, Big>;
  private staleAggregatorCache: TTL<string, number>;

  constructor(
    readonly program: sbv2.SwitchboardProgram,
    aggregatorCacheSize = 250
  ) {
    this.aggregatorCache = new TTL({ max: aggregatorCacheSize, ttl: 5000 });
    this.staleAggregatorCache = new TTL({
      max: aggregatorCacheSize,
      ttl: 30_000, // if agg > 15min stale, only re-check every 30s
    });
  }

  async getFeedLatestValue(
    pubkey: string,
    data?: sbv2.types.AggregatorAccountData
  ): Promise<Big> {
    // race condition: we may call ttlCache.has before the timeout has a chance to remove stale items
    // by checking the TTL map we will get a value of 0 if the item is missing in the cache or stale
    // https://github.com/isaacs/ttlcache/issues/24
    if (this.aggregatorCache.getRemainingTTL(pubkey)) {
      const value = this.aggregatorCache.get(pubkey)!;
      if (value) {
        return value;
      }
    }
    const aggregatorAccount = new sbv2.AggregatorAccount(
      this.program,
      new PublicKey(pubkey)
    );

    let aggregator = data;
    if (!aggregator) {
      const aggregatorAccountInfo =
        await this.program.connection.getAccountInfo(
          aggregatorAccount.publicKey
        );
      if (!aggregatorAccountInfo) {
        throw new Error(`Failed to fetch aggregator account info`);
      }
      if (
        !aggregatorAccountInfo.owner.equals(sbv2.SB_V2_PID) &&
        !aggregatorAccountInfo.owner.equals(
          new PublicKey("2TfB33aLaneQb5TNVwyDz3jSZXS6jdW2ARw1Dgf84XCG")
        )
      ) {
        throw new Error(
          `AggregatorAccount is owned by the wrong program, ${aggregatorAccountInfo.owner}`
        );
      }

      aggregator = sbv2.types.AggregatorAccountData.decode(
        aggregatorAccountInfo.data
      );
    }

    const lastUpdated =
      sbv2.AggregatorAccount.decodeLatestTimestamp(aggregator).toNumber();

    const ts = Date.now() / 1000;
    const elapsed = ts - lastUpdated;
    const stalenessThreshold = Math.max(
      900,
      3 * aggregator.minUpdateDelaySeconds
    );
    if (elapsed > stalenessThreshold) {
      // 15min staleness check
      this.staleAggregatorCache.set(pubkey, elapsed);
      throw new Error(
        `aggregator price stale for ${Math.floor(elapsed)} sec ${pubkey}`
      );
    }

    const res = sbv2.AggregatorAccount.decodeLatestValue(aggregator);
    if (res === null) {
      throw new Error("FeedNotPopulatedError");
    }

    return res;
  }

  async getFeedsLatestValue(...pubkeys: string[]): Promise<Big[]> {
    const cachedValues: Array<FeedResult> = [];
    const keys: Array<string> = [];
    for (const pubkey of pubkeys) {
      if (this.aggregatorCache.getRemainingTTL(pubkey)) {
        const value = this.aggregatorCache.get(pubkey)!;
        cachedValues.push({ pubkey, value });
      } else if (this.staleAggregatorCache.getRemainingTTL(pubkey)) {
        // throw error
        const staleness = this.staleAggregatorCache.get(pubkey)!;
        throw new Error(
          `aggregator price stale for ${Math.floor(staleness)} sec ${pubkey}`
        );
      } else {
        keys.push(pubkey);
      }
    }

    if (cachedValues.length === pubkeys.length) {
      return cachedValues.map((v) => v.value);
    }

    const accounts = await anchor.utils.rpc.getMultipleAccounts(
      this.program.provider.connection,
      keys.map((pubkey) => new PublicKey(pubkey))
    );

    const parsedAccounts: {
      publicKey: PublicKey;
      data: sbv2.types.AggregatorAccountData;
    }[] = [];
    for (const account of accounts) {
      try {
        const data = sbv2.types.AggregatorAccountData.decode(
          account?.account?.data ?? Buffer.from("")
        );

        parsedAccounts.push({
          publicKey: account?.publicKey ?? PublicKey.default,
          data,
        });
      } catch {
        throw new Error(
          `not a valid switchboard v2 aggregator acccount ${account?.publicKey}`
        );
      }
    }

    const fetchedValues: FeedResult[] = await Promise.all(
      parsedAccounts.map(async (feed) => {
        const value = await this.getFeedLatestValue(
          feed.publicKey.toBase58(),
          feed.data
        );
        this.aggregatorCache.set(feed.publicKey.toBase58(), value);
        return {
          pubkey: feed.publicKey.toBase58(),
          value: value,
        };
      })
    );

    // preserve order for sanity checking
    const values: Array<Big> = [];
    for (const pubkey of pubkeys) {
      const cachedIdx = cachedValues.findIndex((i) => i.pubkey === pubkey);
      if (cachedIdx >= 0) {
        values.push(cachedValues[cachedIdx].value);
        continue;
      }
      const fetchedIdx = fetchedValues.findIndex((i) => i.pubkey === pubkey);
      if (fetchedIdx >= 0) {
        values.push(fetchedValues[fetchedIdx].value);
        continue;
      }
      // should we throw an error here or continue?
    }

    if (values.length !== pubkeys.length) {
      throw new Error(`Failed to fetch all aggregator values`);
    }

    return values;
  }

  async getMultipleJobDefinitions(
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
        this.program.provider.connection,
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
}
