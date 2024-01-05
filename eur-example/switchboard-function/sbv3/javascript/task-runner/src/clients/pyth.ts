import {
  AccountType,
  parseBaseData,
  parsePriceData,
  PythConnection,
} from "@pythnetwork/client";
import type { AccountInfo } from "@solana/web3.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { Big, BigUtils } from "@switchboard-xyz/common";

export class PythClient {
  static programId = new PublicKey(
    "FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"
  );

  public rpcEndpoint: string;

  constructor(mainnetConnection: Connection) {
    this.rpcEndpoint = mainnetConnection.rpcEndpoint;
  }

  public async getOraclePrice(
    feedAddress: string,
    acceptedConfidence: number
  ): Promise<Big> {
    const connection = new Connection(this.rpcEndpoint, "confirmed");
    const client = new PythConnection(connection, PythClient.programId);
    const publicKey = new PublicKey(feedAddress);

    // check account is in our account list OR just check owner here
    const accountInfo: AccountInfo<Buffer> | null =
      await connection.getAccountInfo(publicKey);
    if (!accountInfo) {
      throw new Error(
        `PythClientError: Failed to fetch AccountInfo for the provided feed Address ${feedAddress}`
      );
    }

    const base = parseBaseData(accountInfo.data);
    if (!base || base.type !== AccountType.Price) {
      throw new Error(
        `PythClientError: Not a valid Pyth price account for ${feedAddress}`
      );
    }

    const priceData = parsePriceData(accountInfo.data);
    if (priceData === undefined) {
      throw new Error(
        `PythError: Failed to fetch Pyth price account for ${feedAddress}`
      );
    }
    // https://tinyurl.com/ytmp7w4q may be null if not tradng
    if (!priceData.price) {
      priceData.price = priceData.aggregate.price;
      priceData.confidence = priceData.aggregate.confidence;
      const price = new Big(priceData.price!);
      const confidence = new Big(priceData.confidence!);
      // console.log(
      // `PythError: Failed to fetch Pyth price for ${feedAddress}, data: ${priceData.status}, ${price}, ${confidence}`
      // );
      // throw new Error(
      // `PythError: Failed to fetch Pyth price for ${feedAddress}, data: ${priceData.status}, ${price}, ${confidence}`
      // );
    }
    if (priceData.price! === 0) {
      throw new Error(
        `PythError: Failed to fetch Pyth price for ${feedAddress}, price is 0, ${priceData.price}, ${priceData.confidence}`
      );
    }
    const price = new Big(priceData.price!);
    const confidence = new Big(priceData.confidence!);
    const confidencePercent = BigUtils.safeMul(
      BigUtils.safeDiv(confidence, price),
      new Big(100)
    );

    if (
      acceptedConfidence &&
      confidencePercent.gt(new Big(acceptedConfidence))
    ) {
      throw new Error(`PythError: Acceptable confidence percent exceeded`);
    }

    return price;
  }
}
