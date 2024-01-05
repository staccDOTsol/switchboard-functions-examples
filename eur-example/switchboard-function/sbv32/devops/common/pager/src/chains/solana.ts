import * as anchor from "@coral-xyz/anchor";
import * as sbv2 from "@switchboard-xyz/switchboard-v2";
import { Connection, Cluster, PublicKey, Keypair } from "@solana/web3.js";

export async function solanaAction(
  url: string,
  cluster: string,
  programIdRaw: string,
  staleCap: number
): Promise<number> {
  const connection = new Connection(url);
  const programId = new PublicKey(programIdRaw);
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(Keypair.generate()),
    {}
  );
  const idl = (await anchor.Program.fetchIdl(programId, provider))!;
  const program = new anchor.Program(idl, programId, provider);
  const [oraclePubkey] = await PublicKey.findProgramAddress(
    [Buffer.from("ORACLE_V1_SEED")],
    programId
  );
  const oracleData = await program.account.myOracleState.fetch(oraclePubkey);
  const lastReport = new Date(
    (oracleData.btc as any).oracleTimestamp.toNumber() * 1000
  );
  const now = new Date();
  const staleness = (now.getTime() - lastReport.getTime()) / 1000;
  console.log(staleness);
  return staleness;
}
