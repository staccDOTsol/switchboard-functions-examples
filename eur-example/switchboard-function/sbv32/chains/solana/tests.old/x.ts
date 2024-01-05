const assert = require("assert");
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  AttestationQueueAccount,
  FunctionAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";

(async function main() {
  const url =
    "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14";
  const COMMITMENT = "confirmed";
  const connection = new Connection(url, {
    commitment: COMMITMENT,
  });
  const programId = new PublicKey(
    "Hfcxu9zwCB3kFkXxGDCjYr5m7XWYqkVLYhBwvz7qro7L"
  );
  const walletStr = require("fs").readFileSync(
    "/Users/mgild/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json",
    "utf8"
  );
  const walletBuffer = new Uint8Array(JSON.parse(walletStr));
  const walletKeypair = Keypair.fromSecretKey(walletBuffer);
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
  const idl = await anchor.Program.fetchIdl(programId, provider);
  const program = new anchor.Program(idl!, programId, provider);

  const kp = Keypair.generate();
  const response = await program.methods
    .functionRequestInit({
      bounty: 0,
      requestDuration: new anchor.BN(0),
      expirationDuration: new anchor.BN(0),
      containerParams: Buffer.from(""),
    })
    .accounts({
      request: kp.publicKey,
      payer: program.provider.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([kp])
    .rpc();
  console.log(response);
})();
