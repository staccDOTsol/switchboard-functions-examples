import type { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  AccountNotFoundError,
  NativeMint,
  ProgramStateAccount,
  SBV2_MAINNET_PID,
  SwitchboardNetwork,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
dotenv.config();

type SolanaCluster = "localnet" | "devnet" | "mainnet-beta";

export const sleep = (ms: number): Promise<any> =>
  new Promise((s) => setTimeout(s, ms));

export const DEFAULT_KEYPAIR_PATH = path.join(
  os.homedir(),
  ".config/solana/id.json"
);

export interface TestContext {
  cluster: SolanaCluster;
  program: SwitchboardProgram;
  payer: Keypair;
  toUrl: (signature: string) => string;
}

export function isLocalnet(): boolean {
  if (process.env.SOLANA_LOCALNET) {
    switch (process.env.SOLANA_LOCALNET) {
      case "1":
      case "true":
      case "localnet": {
        return true;
      }
    }
  }
  return false;
}

export function getCluster(): SolanaCluster {
  if (process.env.SOLANA_CLUSTER) {
    const cluster = String(process.env.SOLANA_CLUSTER);
    if (
      cluster === "localnet" ||
      cluster === "devnet" ||
      cluster === "mainnet-beta"
    ) {
      return cluster;
    } else {
      throw new Error(
        `SOLANA_CLUSTER must be localnet, devnet, or mainnet-beta`
      );
    }
  }

  if (isLocalnet()) {
    return "localnet";
  }

  return "devnet";
}

export function getProgramId(cluster: SolanaCluster): PublicKey {
  if (process.env.SWITCHBOARD_PROGRAM_ID) {
    return new PublicKey(process.env.SWITCHBOARD_PROGRAM_ID);
  }

  return new PublicKey("6R7NVtYcaGQmvJ4F1XDL2cppJN4KrStGWkUQq2HUwDr1");

  return SBV2_MAINNET_PID;
}

export function getRpcUrl(cluster: SolanaCluster): string {
  if (process.env.SOLANA_RPC_URL) {
    return String(process.env.SOLANA_RPC_URL);
  }

  if (cluster === "localnet") {
    return "http://localhost:8899";
  }

  return clusterApiUrl(cluster);
}

export async function setupTest(anchorProgram?: Program): Promise<TestContext> {
  const cluster = getCluster();
  const payer: Keypair = fs.existsSync(DEFAULT_KEYPAIR_PATH)
    ? Keypair.fromSecretKey(
        new Uint8Array(
          JSON.parse(fs.readFileSync(DEFAULT_KEYPAIR_PATH, "utf8"))
        )
      )
    : Keypair.generate();

  const programId = getProgramId(cluster);
  const program =
    anchorProgram !== undefined
      ? new SwitchboardProgram(
          anchorProgram,
          "mainnet-beta",
          await NativeMint.load(anchorProgram.provider as AnchorProvider)
        )
      : await SwitchboardProgram.load(
          cluster,
          new Connection(getRpcUrl(cluster), { commitment: "confirmed" }),
          payer,
          programId
        );

  // request airdrop if low on funds
  const payerBalance = await program.connection.getBalance(payer.publicKey);
  if (payerBalance === 0) {
    const airdropTxn = await program.connection.requestAirdrop(
      payer.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    console.log(`Airdrop requested: ${airdropTxn}`);
    await program.connection.confirmTransaction(airdropTxn);
  }

  // // Check if programStateAccount exists
  // try {
  //   await ProgramStateAccount.getOrCreate(program);
  // } catch (error) {
  //   console.error(error);
  //   throw error;
  // }
  // try {
  //   const programState = await program.connection.getAccountInfo(
  //     program.programState.publicKey
  //   );
  //   if (!programState || programState.data === null) {
  //     console.log(
  //       `Creating programState ... ${program.programState.publicKey}`
  //     );
  //     await ProgramStateAccount.getOrCreate(program);
  //   }
  // } catch (e) {
  //   console.error(e);
  // }

  await program.mint.getOrCreateAssociatedUser(program.walletPubkey);

  return {
    cluster,
    program,
    payer,
    toUrl: (signature) =>
      cluster === "localnet"
        ? `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`
        : `https://explorer.solana.com/tx/${signature}${
            cluster === "devnet" ? "?cluster=devnet" : ""
          }`,
  };
}

export class Switchboard extends SwitchboardNetwork {
  private static _instances: Map<string, Promise<Switchboard>> = new Map();

  private constructor(network: SwitchboardNetwork, readonly name: string) {
    super(network);
  }

  public static load(program: Program, name = "default"): Promise<Switchboard> {
    if (!this._instances.has(name)) {
      this._instances.set(
        name,
        new Promise(async (resolve, reject) => {
          try {
            const sbv2 = await new SwitchboardProgram(
              program,
              "localnet",
              await NativeMint.load(program.provider as AnchorProvider)
            );
            const switchboardNetwork = SwitchboardNetwork.find(sbv2, name);
            const switchboard = new Switchboard(switchboardNetwork, name);
            // try {
            //   await switchboard.queue.account.loadData();
            // } catch (error) {
            //   if (!(error instanceof AccountNotFoundError)) {
            //     throw error;
            //   }

            //   await SwitchboardNetwork.create(program, {
            //     name: "",
            //     reward: 0,
            //     minStake: 0,
            //   });
            // }
            resolve(switchboard);
          } catch (error) {
            reject(error);
          }
        })
      );
    }

    return this._instances.get(name)!;
  }
}
