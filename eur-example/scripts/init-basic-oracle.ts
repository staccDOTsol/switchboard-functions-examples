import { QueueAccount, SwitchboardProgram, loadKeypair } from "@switchboard-xyz/solana.js";
import * as anchor from "@coral-xyz/anchor";
import { UsdyUsdOracle } from "../target/types/usdy_usd_oracle";
import dotenv from "dotenv";
import { loadDefaultQueue } from "./utils";
import fs from 'fs'
import { PublicKey } from "@solana/web3.js";

dotenv.config();

(async () => {

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);



  const payer = (provider.wallet as anchor.Wallet).payer;
  console.log(`PAYER: ${payer.publicKey}`);

  let program = new anchor.Program(
    JSON.parse(
      fs.readFileSync(
        "./target/idl/spotify_example.json",
        "utf8"
      ).toString()
    ),
    new PublicKey("BUhaGyJbdbfV24BiW2GPjtqeUhkMZ2E9bYuu34pB8YEs"),
    provider
  );
  console.log(`PROGRAM: ${program.programId}`);

  const switchboardProgram = await SwitchboardProgram.fromProvider(provider);

  const [programStatePubkey, b1] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("SPOTIFY_EXAMPLE")],
    program.programId
  );
  console.log(`PROGRAM_STATE: ${programStatePubkey}`);

  
let switchboard: SwitchboardProgram = await SwitchboardProgram.fromProvider(
  provider
);
const [oracle, b2] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("SPOTIFY_EXAMPLE_ORACLE"), payer.publicKey.toBuffer()],
  program.programId
);
console.log(`ORACLE_PUBKEY: ${oracle}`);
let oracle_account_info_maybe = await provider.connection.getAccountInfo(oracle);
if (oracle_account_info_maybe){
  let oracle_account_data = program.account.oracle.fetch(oracle);
  console.log(`ORACLE_ACCOUNT_DATA: ${oracle_account_data}`);

  const signature = await program.methods
    .get_artists()
    .accounts({
      oracle
    })
    .rpc();

  console.log(signature);
}

  const attestationQueueAccount = await loadDefaultQueue(switchboardProgram);
  console.log(`ATTESTATION_QUEUE: ${attestationQueueAccount.publicKey}`);

  // Create the instructions to initialize our Switchboard Function
  const [functionAccount, functionInit] =
    await attestationQueueAccount.createFunctionInstruction(payer.publicKey, {
      container: `${process.env.DOCKERHUB_ORGANIZATION ?? "switchboardlabs"}/${
        process.env.DOCKERHUB_CONTAINER_NAME ?? "solana-ondo-oracle-function"
      }`,
      version: `${process.env.DOCKERHUB_CONTAINER_VERSION ?? "latest"}`, // TODO: set to 'latest' after testing
    });
  console.log(`SWITCHBOARD_FUNCTION: ${functionAccount.publicKey}`);

  const signature = await program.methods
    .initialize(b1, b2) //initialize 
    .accounts({
      oracle,
      program: programStatePubkey,
      authority: payer.publicKey,
      payer: payer.publicKey,
      switchboardFunction: functionAccount.publicKey,
    })
    .signers([...functionInit.signers])
    .preInstructions([...functionInit.ixns])
    .rpc();

  console.log(`[TX] initialize: ${signature}`);
await provider.connection.confirmTransaction(signature, "confirmed");

})();