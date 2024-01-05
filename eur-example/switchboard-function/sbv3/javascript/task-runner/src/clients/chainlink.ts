import {
  CHAINLINK_AGGREGATOR_PROGRAM_ID,
  CHAINLINK_STORE_PROGRAM_ID,
} from "@chainlink/solana-sdk";
import * as anchor from "@coral-xyz/anchor";
import type { AccountInfo, Connection } from "@solana/web3.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Big, BigUtils, BN } from "@switchboard-xyz/common";

interface TransmissionHeader {
  version: number;
  state: number;
  owner: PublicKey;
  proposedOwner: PublicKey;
  writer: PublicKey;
  description: Buffer;
  decimals: number;
  flaggingThreshold: number;
  latestRoundId: number;
  granularity: number;
  liveLength: number;
  liveCursor: number;
  historicalCursor: number;
}

const DEFAULT_KEYPAIR = Keypair.fromSeed(new Uint8Array(32).fill(1));

export class ChainlinkClient {
  static storeProgramId = CHAINLINK_STORE_PROGRAM_ID;

  static aggregatorProgramId = CHAINLINK_AGGREGATOR_PROGRAM_ID;

  public connection: Connection;

  private _program?: Promise<anchor.Program> | undefined = undefined;

  constructor(mainnetConnection: Connection) {
    this.connection = mainnetConnection;
  }

  get program(): Promise<anchor.Program> {
    return (async () => {
      try {
        if (this._program === undefined) {
          const emptyProvider = new anchor.AnchorProvider(
            this.connection,
            new anchor.Wallet(DEFAULT_KEYPAIR),
            anchor.AnchorProvider.defaultOptions()
          );

          const storeIdl = await anchor.Program.fetchIdl(
            ChainlinkClient.storeProgramId,
            emptyProvider
          );

          if (!storeIdl) {
            throw new Error(`failed to read chainlink store idl`);
          }

          const storeProgram = new anchor.Program(
            storeIdl,
            ChainlinkClient.storeProgramId,
            emptyProvider
          );
          this._program = new Promise((resolve, reject) => {
            resolve(storeProgram);
          });
        }
        return this._program;
      } catch (e) {
        throw new Error(`failed to load chainlink client`);
      }
    })();
  }

  public async getOraclePrice(feedAddress: string): Promise<Big> {
    const program = await this.program;
    const accountCoder = new anchor.BorshAccountsCoder(program.idl);

    const publicKey = new PublicKey(feedAddress);

    const headerConstant = (program.idl.constants ?? []).find(
      (c) => c.name === "HEADER_SIZE"
    );
    const headerSize = Number.parseInt(headerConstant?.value ?? "192", 10);

    // const roundType = program.idl.types.find((t) => t.name === "Round");
    const roundTypeSize = 48; // IDL size is not accurate, returning 40

    const accountInfo: AccountInfo<Buffer> | null =
      await this.connection.getAccountInfo(publicKey);
    if (!accountInfo) {
      throw new Error(
        `ChainlinkClientError: Failed to fetch AccountInfo for the provided feed Address ${feedAddress}`
      );
    }

    const header: TransmissionHeader = accountCoder.decode(
      "Transmissions",
      accountInfo.data
    );

    const transmissionStart =
      anchor.ACCOUNT_DISCRIMINATOR_SIZE +
      headerSize +
      (header.liveCursor - 1) * roundTypeSize;

    const cursor = accountInfo.data.slice(
      transmissionStart,
      transmissionStart + roundTypeSize
    );

    const answer = new BN(cursor.slice(16, 32), "le");

    const result = BigUtils.safeDiv(
      BigUtils.fromBN(answer),
      BigUtils.safePow(new Big(10), header.decimals)
    );

    return result;
  }
}
