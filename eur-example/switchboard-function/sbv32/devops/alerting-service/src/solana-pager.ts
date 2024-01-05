import { configList } from "./function";
import { OrcaExchange } from "./orca";
import { Pager } from "./pager";

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as spl from '@solana/spl-token';
import * as sbv2 from "@switchboard-xyz/solana.js";
import { SwitchboardProgram, FunctionAccount } from "@switchboard-xyz/solana.js";
import * as bs58 from "bs58";
import cluster from "cluster";
import { net } from "web3";

function toCluster(cluster: string): anchor.web3.Cluster {
  if (cluster === "mainnet") cluster = "mainnet-beta";
  switch (cluster) {
    case "devnet":
      return "devnet";
    case "testnet":
      return "testnet";
    case "mainnet-beta":
      return cluster;
  }
  throw new Error(`Invalid cluster type ${cluster}`);
}

async function checkFeedHealth(
  program: sbv2.SwitchboardProgram,
  aggregatorPublicKey: anchor.web3.PublicKey,
  msTillStale: number,
  pager: Pager
) {
  const [aggregatorAccount, aggregatorData] = await sbv2.AggregatorAccount.load(
    program,
    aggregatorPublicKey
  );

  const latestRoundDate = new Date(
    sbv2.AggregatorAccount.decodeLatestTimestamp(aggregatorData)
      .muln(1_000)
      .toNumber()
  );
  const staleness = Date.now() - latestRoundDate.getTime();
  if (staleness > msTillStale) {
    await pager.sendPage({
      aggregator: aggregatorAccount.publicKey.toBase58(),
      message: "Feed is stale",
    });
  }
  return {
    staleness: staleness / 1000,
    aggregator: aggregatorPublicKey.toBase58(),
    page: staleness > msTillStale,
  };
}

export const checkSolana = async (
  address: string,
  network: string,
  minTillStale: number
) => {
  try {
    const cluster = toCluster(network);

    const result = await checkFeedHealth(
      /* program= */ await sbv2.SwitchboardProgram.fromConnection(
        new anchor.web3.Connection(configList.solana[cluster].rpc)
      ),
      /* aggregatorPublicKey= */ new anchor.web3.PublicKey(address),
      /* msTillStale= */ 60_000 * minTillStale,
      /* pager= */ new Pager(
        configList.solana[cluster].pdKey,
        `Solana ${cluster} Alert v2: `,
        "solana",
        cluster
      )
    );
    return result;
  } catch (e: any) {
    console.error(`${e.stack.toString()}`);
    return e;
  }
};

export async function checkPrice(address: String) {
  const program = await sbv2.SwitchboardProgram.fromConnection(
    new anchor.web3.Connection(configList.solana["mainnet-beta"].rpc)
  );
  const aggregatorPublicKey = new anchor.web3.PublicKey(address);
  const [aggregatorAccount, aggregatorData] = await sbv2.AggregatorAccount.load(
    program,
    aggregatorPublicKey
  );
  const price =
    sbv2.AggregatorAccount.decodeLatestValue(aggregatorData).toNumber();

  return price;
}

async function getConnection(cluster: string) {
  const rpcs = configList.solana[cluster].rpcs;
  for (let i = 0; i < rpcs.length; i++) {
    console.log("trying ", rpcs[i]);
    const connection = new anchor.web3.Connection(rpcs[i]);
    try {
      const height = await connection.getBlockHeight("processed");
      console.log("height: ", height);

      return connection;
    } catch (e) {
      console.error("faulting endpoint: ", rpcs[i]);
      await new Pager(
        configList.solana[cluster].pdKey,
        `RPC failure`,
        "solana",
        cluster
      ).sendPage({ endpoint: rpcs[i] });
    }
  }
  throw "no working RPC endpoints";
}

export async function checkSolanaBalance(address: string, network: string) {
  const connection = await getConnection(network);
  const key = new PublicKey(address);
  const balance = await connection.getBalance(key, "confirmed");

  return balance;
}


export async function checkSolanaBalanceAndPage(
  address: string,
  network: string,
  threshold: number
) {
  const balance = await checkSolanaBalance(address, network);
  const pdKey = configList.sui[network].pdKey;
  const pager = new Pager(
    pdKey,
    "Solana " + network + "Balance Alert:",
    "solana",
    network
  );
  if (balance < threshold) {
    await pager.sendPage(
      `(${address}) needs funding (balance: ${balance.toString()})`
    ); //sendPage("FUND", oracle, isMainnet);
  }
}


// export async function checkSolanaRoutineBalance(address: string, network: string) {
// if (network != "mainnet-beta" && network != "devnet"){
//   throw("invalid network");
// }
//   const connection = await getConnection(network);
// const program = await SwitchboardProgram.load(network, connection);
// const [routineAccount, routineData] = await FunctionAccount.load(program, address);

// // Load the RoutineAccount's escrow account, and convert the balance from lamports to Sol.
// const escrowAccount = await spl.getAccount(program.connection, routineData.escrowTokenWallet);
// const solBalance = program.mint.fromTokenAmount(escrowAccount.amount);
// return solBalance
// }

export async function fundSolanaWallet(
  address: string,
  amount: number,
  network: string
) {
  const connection = await getConnection(network);

  // Derive the wallet from the private key
  const wallet = anchor.web3.Keypair.fromSecretKey(
    bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY)
  );

  // Generate the public key of the recipient
  const recipient = new anchor.web3.PublicKey(address);

  // Add transfer instruction to transaction
  const transaction = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: recipient,
      lamports: anchor.web3.LAMPORTS_PER_SOL * amount, // 1 SOL
    })
  );

  // Sign transaction, broadcast, and confirm
  const signature = await anchor.web3.sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet]
  );

  console.log("Transaction sent:", signature);
}

// getConnection("devnet").then(async (connection) => {
//   let height = await connection.getBlockHeight("processed");
//   console.log("height from getConnection: ", height);
// })

// async function checkOrca() {
//   let connection = new Connection(configList.solana["mainnet-beta"].rpc, {});
//   let orca = new OrcaExchange(connection);
//   const orcaPool = "9XzJpnEti2v4kSf1nGCC4gyysj5wumAve1Fza3sx5eei"
//   let out = await orca.calculateSwapPrice(
//     new PublicKey(orcaPool) //(req.params.address) //
//   );
//   console.log(out.toString());
//   const feedOfConcern = "wrmkUpvfjKxjSvExfsaFfLYhKatYyhPrwZnigupej4e";

//   const feedPrice = await checkPrice(feedOfConcern)
//   const lpPrice = out.toNumber();
//   console.log(JSON.stringify({ lpPrice, feedPrice }));

// }
// checkOrca().then(() => console.log("done"));

// checkSolana(
//   "8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee",
//   "mainnet-beta",
//   90
// ).then((result) => {
//   console.log(JSON.stringify(result));
//   return;
// });
