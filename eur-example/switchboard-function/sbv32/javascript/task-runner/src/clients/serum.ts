import { Market } from "@project-serum/serum";
import type { Order } from "@project-serum/serum/lib/market";
import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { Big, BigUtils } from "@switchboard-xyz/common";

function upgradeMarket(market: string | PublicKey): string {
  const pubkey = typeof market === "string" ? market : market.toBase58();
  switch (pubkey) {
    // SOL/USDC
    case "9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT": {
      return "8BnEgHoWFysVcuFFX7QztDmzuH8r5ZFvyP3sYwn1XTh6";
    }
    // USDT/USDC
    case "77quYg4MGneUdjgXCunt9GgM1usmrxKY31twEy3WHwcS": {
      return "B2na8Awyd7cpC59iEU43FagJAPLigr3AP3s38KM982bu";
    }
    // MSOL/USDC
    case "6oGsL2puUgySccKzn9XA9afqF217LfxP5ocq4B3LWsjy": {
      return "9Lyhks5bQQxb9EyyX55NtgKQzpM4WK7JCmeaWuQ5MoXD";
    }
    // wheETH/USDC
    case "8Gmi2HhZmwQPVdCwzS7CM66MGstMXPcTVHA7jF19cLZz": {
      return "FZxi3yWkE5mMjyaZj6utmYL54QQYfMCKMcLaQZq4UwnA";
    }
    default: {
      return pubkey;
    }
  }
}

export class SerumSwap {
  public programAddress = new PublicKey(
    // "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
  ); // serum mainnet PID

  public connection: Connection;

  constructor(mainnetConnection: Connection) {
    this.connection = mainnetConnection;
  }

  /** Calculate the swap price for a given serum pool */
  public async calculateSwapPrice(poolAddress: string): Promise<Big> {
    const marketAddress = upgradeMarket(poolAddress);

    let market: Market;
    try {
      market = await Market.load(
        this.connection,
        new PublicKey(marketAddress),
        {},
        this.programAddress
      );
    } catch (error) {
      throw new Error(`failed to load serum market ${error}`);
    }

    const lastBid = this.getLastBid(market);
    const lastAsk = this.getLastAsk(market);
    const lastFill = this.getLastFill(market);

    const bigArray: Array<Big> = (
      await Promise.all([lastBid, lastAsk, lastFill])
    )
      .filter((result) => {
        return result !== undefined;
      })
      .map((r) => {
        if (r === undefined) {
          throw new Error("This should never happen.");
        }
        return new Big(r);
      });
    if (bigArray.length === 0) {
      throw new Error(`failed to load serum market ${marketAddress}`);
    }

    const result = BigUtils.median(bigArray);
    return result;
  }

  private async getLastBid(market: Market): Promise<Big> {
    try {
      const bids = await market.loadBids(this.connection);
      const lastBidIterator = bids.items(true).next();
      const lastBidOrder = lastBidIterator.value as Order;
      return new Big(lastBidOrder.price);
    } catch (error) {
      throw new Error(
        `failed to retrieve bids for serum market ${market.publicKey}, ${error}`
      );
    }
  }

  private async getLastAsk(market: Market): Promise<Big> {
    try {
      const asks = await market.loadAsks(this.connection);
      const lastAskIterator = asks.items(false).next();
      const lastAskOrder = lastAskIterator.value as Order;
      return new Big(lastAskOrder.price);
    } catch (error) {
      throw new Error(
        `failed to retrieve bids for serum market, ${market.publicKey}, ${error}`
      );
    }
  }

  private async getLastFill(market: Market): Promise<Big | undefined> {
    const fills = await market.loadFills(this.connection, 100);
    if (fills.length === 0) {
      // logger.warn(
      //   "failed to retrieve fills for serum market " + market.publicKey
      // );
      return undefined;
    }
    return new Big(fills[0].price);
  }
}
