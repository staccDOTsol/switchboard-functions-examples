/* eslint-disable no-case-declarations */
/* eslint-disable prettier/prettier */
//import { checkAptosFeed } from "./aptos-pager";
import { SWITCHBOARD_APTOS_CONFIG } from "./networks/aptos";
import { SWITCHBOARD_ARBITRUM_CONFIG } from "./networks/arbitrum";
import { SWITCHBOARD_BASE_CONFIG } from "./networks/base";
// import { SWITCHBOARD_AUORA_CONFIG } from "./networks/auora"
// import { SWITCHBOARD_ETHEREUM_CONFIG } from "./networks/ethereum"
import { SWITCHBOARD_NEAR_CONFIG } from "./networks/near";
import { SWITCHBOARD_OPTIMISM_CONFIG } from "./networks/optimism";
import { SWITCHBOARD_SOLANA_CONFIG } from "./networks/solana";
import { SWITCHBOARD_SUI_CONFIG } from "./networks/sui";
import { SWITCHBOARD_STARKNET_CONFIG } from "./networks/starknet";
import { checkAptosBalance, checkAptosFeed } from "./aptos-pager";
import {
  checkEvmBalance,
  checkEvmBalanceAndPage,
  checkEvmFeeds,
  checkEvmLease,
  fundEvmWallet,
} from "./evm-pager";
// import { checkSuiFeed, checkSuiBalance } from "./sui-pager";
// import { checkCoredaoFeed, checkCoredaoBalance } from "./coredao-pager";
import { OrcaExchange } from "./orca";
import { Pager } from "./pager";
import {
  checkPrice,
  checkSolana,
  checkSolanaBalance,
  checkSolanaBalanceAndPage,
  fundSolanaWallet,
} from "./solana-pager";
import { checkSuiBalance, checkSuiFeed, fundSuiWallet } from "./sui-pager";
import {
  checkStarknetBalanceAndPage,
  checkStarknetBalance,
  checkStarknetFeeds,
  fundStarknetWallet,
} from "./starknet-pager";
import { Connection, PublicKey } from "@solana/web3.js";
import express from "express";
import * as url from "url";
import * as path from "path";
import * as ejs from "ejs";

export const app: ReturnType<typeof express> = express();
app.use(express.json());

app.post("/balances/", async (req, res) => {
  if (!Array.isArray(req.body)) {
    res.status(400).send("Expected a JSON array");
    return;
  }
  console.log("got request:\n", JSON.stringify(req.body));
  let result = [];
  await Promise.all(
    req.body.map(async (wallet: any) => {
      switch (wallet.chain) {
        case "solana":
          wallet.balance = await checkSolanaBalance(
            wallet.address,
            wallet.network
          );
          // res.send(wallet);
          result.push(wallet);
          break;

        case "coredao":
        case "arbitrum":
          wallet.balance = await checkEvmBalance(
            wallet.network,
            wallet.address,
            wallet.chain
          );
          // res.send(wallet);
          result.push(wallet);
          break;
        case "starknet":
          wallet.balance = await checkStarknetBalance(
            wallet.network,
            wallet.address,
            wallet.chain
          );
          result.push(wallet);
          break;
      }
    })
  );
  res.send(result);
  return;
});

//exports.myFunction = app;
app.get("/:chain/:network/check/balance/", async (req, res) => {
  const chain = req.params.chain;
  const network = req.params.network;

  // get query params
  const address = req.query.address;
  const threshold = req.query.threshold;

  // assert query params are strings
  if (typeof address !== "string") {
    res.status(400).send("Query param address must exist.");
    return;
  }

  // assert threshold is a number
  if (typeof threshold !== "string") {
    res.status(400).send("Query param threshold must exist.");
    return;
  }

  const nodeUrl = configList[chain][network].rpc;
  const pid = configList[chain][network].pid;
  console.log(
    `got request: (address: ${address}, chain: ${chain}, network: ${network})`
  );

  switch (chain) {
    case "aptos":
      try {
        await checkAptosBalance(network, nodeUrl, address, Number(threshold));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      break;
    case "arbitrum":
      try {
        await checkEvmBalanceAndPage(
          network,
          nodeUrl,
          Number(threshold),
          "arbitrum"
        );
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      res.end();
      break;
    case "optimism":
      try {
        await checkEvmBalanceAndPage(
          network,
          nodeUrl,
          Number(threshold),
          "optimism"
        );
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      res.end();
      break;

    case "coredao":
      try {
        await checkEvmBalanceAndPage(
          network,
          nodeUrl,
          Number(threshold),
          "coredao"
        );
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      res.end();
      break;

    case "solana":
      try {
        await checkSolanaBalanceAndPage(network, nodeUrl, Number(threshold));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      res.end();
      break;

    case "sui":
      try {
        await checkSuiBalance(address, network, Number(threshold));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      res.end();
      break;
    case "starknet":
      try {
        await checkStarknetBalanceAndPage(
          network,
          address,
          Number(threshold),
          "starknet"
        );
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      res.end();
      break;
  }
});

//only relevant for evm chains
app.get("/:chain/:network/check/lease/", async (req, res) => {
  const chain = req.params.chain;
  const network = req.params.network;

  // get query params
  const address = req.query.address;
  const threshold = req.query.threshold;

  // assert query params are strings
  if (typeof address !== "string") {
    res.status(400).send("Query param address must exist.");
    return;
  }

  // assert threshold is a number
  if (typeof threshold !== "string") {
    res.status(400).send("Query param threshold must exist.");
    return;
  }

  console.log(
    `got lease balance request: (address: ${address}, chain: ${chain}, network: ${network})`
  );

  switch (chain) {
    case "arbitrum":
      try {
        await checkEvmLease("arbitrum", network, address, Number(threshold));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      res.end();
      break;

    case "optimism":
      try {
        await checkEvmLease("optimism", network, address, Number(threshold));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      res.end();
      break;

    case "coredao":
      try {
        await checkEvmLease("coredao", network, address, Number(threshold));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
        break;
      }
      res.sendStatus(200);
      res.end();
      break;
  }
});

app.get("/:chain/:network/check/staleness", async (req, res) => {
  const minTillStale = +(req.query.minTillStale ?? "10");
  const address = String(req.query.address);
  const chain = req.params.chain;
  const network = req.params.network;
  const targetPrice = Number(req.query.targetPrice);
  const varianceThreshold = Number(req.query.varianceThreshold);

  // const nodeUrl = configList[chain][network].rpc;
  // const pid = configList[chain][network].pid;
  console.log(
    `got request: (minTillStale: ${minTillStale}, address: ${address}, chain: ${chain}, network: ${network})`
  );
  console.log("params: \n" + JSON.stringify(req.params));
  let pdKey = configList[chain][network].pdKey;
  if (pdKey === null) {
    pdKey = configList.defaultPdKey[network];
  }
  switch (chain) {
    case "aptos":
      try {
        let result;
        if (targetPrice && varianceThreshold) {
          result = await checkAptosFeed(
            address,
            network,
            minTillStale,
            targetPrice,
            varianceThreshold
          );
        } else {
          result = await checkAptosFeed(address, network, minTillStale);
        }
        res.status(200).send(Buffer.from(JSON.stringify(result)));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
      }
      break;
    case "arbitrum":
      try {
        const result = await checkEvmFeeds(
          minTillStale,
          configList.arbitrum[network].rpc,
          SWITCHBOARD_ARBITRUM_CONFIG[network].sbPushOracle,
          network,
          "arbitrum",
          0.1
        );
        res.status(200).send(Buffer.from(JSON.stringify(result)));
        res.end();
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
      }
      break;
    case "coredao":
      try {
        const result = await checkEvmFeeds(
          minTillStale,
          configList.coredao[network].rpc,
          configList.coredao[network].pid,
          network,
          "coredao",
          10
        );
        res.status(200).send(Buffer.from(JSON.stringify(result)));
        res.end();
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
      }
      break;
    case "solana":
      try {
        const result = await checkSolana(address, network, minTillStale);
        res.status(200).send(Buffer.from(JSON.stringify(result)));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
      }
      break;
    case "sui":
      try {
        const result = await checkSuiFeed(address, network, minTillStale);
        res.status(200).send(Buffer.from(JSON.stringify(result)));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
      }
      break;
    case "starknet":
      try {
        const result = await checkStarknetFeeds(
          minTillStale,
          configList.starknet[network].rpc,
          SWITCHBOARD_STARKNET_CONFIG[network].sbPushOracle,
          network,
          "starknet"
        );
        res.status(200).send(Buffer.from(JSON.stringify(result)));
      } catch (e) {
        res.status(500).send(e);
        console.error(e);
        res.end();
      }
      break;
  }
});


/*
app.get("/orca/", async (req, res) => {

  const connection = new Connection(configList.solana["mainnet-beta"].rpc, {});
  const orca = new OrcaExchange(connection);
  const orcaPool = "9XzJpnEti2v4kSf1nGCC4gyysj5wumAve1Fza3sx5eei"
  const out = await orca.calculateSwapPrice(
    new PublicKey(orcaPool) //(req.params.address) //
  );
  console.log(out.toString());
  const feedOfConcern = "wrmkUpvfjKxjSvExfsaFfLYhKatYyhPrwZnigupej4e";

  const feedPrice = await checkPrice(feedOfConcern)
  const lpPrice = out.toNumber();
  if (lpPrice / feedPrice > 1.01 || lpPrice / feedPrice < 0.99) {
    await new Pager(
      configList.solana["mainnet"].pdKey,
      `Solana Mainnet Orca Alert v2: `,
      "solana",
      "mainnet"
    ).sendPage({
      message: `orca feed drifted (lp price: ${lpPrice}  feed price: ${feedPrice})`
    })
  }
  res.status(200).send(JSON.stringify({ lpPrice, feedPrice }));
});
*/

app.get("/:chain/:network/fund/:address", async (req, res) => {
  const address = req.params.chain;
  const chain = req.params.chain;
  const network = req.params.network;
  const amount = Number(req.query.amount);
  if (!(amount > 0)) {
    res
      .status(400)
      .send(JSON.stringify({ message: `invalid amount (${amount})` }));
  }
  if (!whiteListedAdresses.includes(address)) {
    res.status(400).send(
      JSON.stringify({
        message: `address not found in whitelist (${address})`,
      })
    );
  }

  switch (chain) {
    case "coredao":
      try {
        const coreResult = await fundEvmWallet(address, amount, chain, network);
        res.status(200).send(JSON.stringify(coreResult));
      } catch (e) {
        res.status(500).send(e);
      }
      break;
    case "arbitrum":
      try {
        const arbitrumResult = await fundEvmWallet(
          address,
          amount,
          chain,
          network
        );
        res.status(200).send(JSON.stringify(arbitrumResult));
      } catch (e) {
        res.status(500).send(e);
      }
      break;
    case "optimism":
      try {
        const optimismResult = await fundEvmWallet(
          address,
          amount,
          chain,
          network
        );
        res.status(200).send(JSON.stringify(optimismResult));
      } catch (e) {
        res.status(500).send(e);
      }
      break;
    case "solana":
      try {
        const solanaResult = await fundSolanaWallet(address, amount, network);
        res.status(200).send(JSON.stringify(solanaResult));
      } catch (e) {
        res.status(500).send(e);
      }
      break;
    case "sui":
      try {
        const suiResult = await fundSuiWallet(address, amount, network);
        res.status(200).send(JSON.stringify(suiResult));
      } catch (e) {
        res.status(500).send(e);
      }
      break;
    case "starknet":
      try {
        const starknetResult = await fundStarknetWallet(
          address,
          amount,
          "starknet",
          network
        );
        res.status(200).send(JSON.stringify(starknetResult));
      } catch (e) {
        res.status(500).send(e);
      }
      break;
  }
});


app.set('view engine', 'ejs');
app.get("/", (req, res) => {
  const watchlist = [{
    "chain": "arbitrum",
    "name": "payer",
    "address": "0x4e92B2A0376E14940417DE5c0Ca55AE613ca0351",
    "network": "testnet"
  },
  {
    "chain": "arbitrum",
    "name": "payer",
    "address": "0x4e92B2A0376E14940417DE5c0Ca55AE613ca0351",
    "network": "mainnet"
  }];
  res.render("balances", {watchlist: JSON.stringify(watchlist)});
});

app.listen(8080, () => {
  console.log(`⚡️[server]: Server is running at https://localhost:8080`);
});

// app.listen(process.env.PORT, () => {
//   console.log("server connected!");
// });

// exports.checkChain = app;
// functions.http("checkChain", app);

/*

gcloud functions deploy pager-function \
--gen2 \
--runtime=nodejs18 \
--region=us-central1 \
--project=switchboard-indexers \
--source=. \
--entry-point=checkChain \
--trigger-http \
--allow-unauthenticated

aptos pubkey: 0xaccd555ece9309f0fc3d7511294df16c9ed30a2c09006b226182956092185510
solana pubkey: nXsE22JSmWYk7f4KtfjXVqCvGuaVXntdSbCKzdumzFv
sui pubkey: 0x934016e97510feb864b4ad87930d950871bd0214e738cd62a8c46c720aad8e37
evm pubkey: 0x4df16019d155d98D68f107d952E80065dAdB1Cad

env:
APTOS_WALLET_PRIVATE_KEY
NEAR_WALLET_PRIVATE_KEY
SOLANA_WALLET_PRIVATE_KEY
SUI_WALLET_PRIVATE_KEY
EVM_WALLET_PRIVATE_KEY

curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/mainnet/check/staleness/?minTillStale=90&address=8Zn42dJjp75PUyPSwWFzoUDHcGKGL5VBX5Y3A6HivVrR
curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/mainnet/check/staleness/?minTillStale=90&address=2C7EGwUgRdSof2ReXWi2zaQW7fLBBDnZJSizW1ptEFTL
curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/mainnet/check/staleness/?minTillStale=90&address=C3p8SSWQS8j1nx7HrzBBphX5jZcS1EY28EJ5iwjzSix2
curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/mainnet/check/staleness/?minTillStale=90&address=9pb1mXfUWTZKE9wgGW4uJw9bKobrVANkPRsqzBakfL6E

curl "https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/aptos/mainnet/check/staleness/?minTillStale=90&address=0x4531f956f68ccf05ab29a1db5e73f7c828af5f42f2018b3a74bf934e81fef80f"

curl "https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/solana/mainnet-beta/check/staleness/?minTillStale=90&address=BnT7954eT3UT4XX5zf9Zwfdrag5h3YmzG8LBRwmXo5Bi"
curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/solana/devnet/check/staleness/?minTillStale=90&address=8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee


curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/testnet/check/staleness?address=21EKutL6JAudcS2MVvfgvCsKqxLNovy72rqpwo4gwzfR&minTillStale=5

curl "https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/aptos/testnet/check/staleness/?minTillStale=0.1&address=0xc07d068fe17f67a85147702359b5819d226591307a5bb54139794f8931327e88"
curl "https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/coredao/testnet/check/staleness/?minTillStale=90"

curl "https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/aptos/testnet/check/balance/?threshold=50&address=0xef84c318543882400c4498c81759e18084a1a5f820bfc683e6f53e3daeb449e2"

*/

// exports.pager = app;

// export const pager: HttpFunction = async (req, res) => {
//     try {
//      // const isMainnet = process.env.CLUSTER === "mainnet";

//       const address = req.query.address!.toString();
//       const minTillStale = +(req.query.minTillStale ?? "10");
//       const nodeUrl = process.env.NODE_URL;

//       const parsedUrl = url.parse(req.url, true);
//       const params = parsedUrl.query;
//       for (const key in params) {
//         console.log(key + ': ' + params[key]);
//       }
//       const oracles = process.env.ORACLES?.split(",");
//       if (!oracles) {
//         return;
//       }

//       for (let oracle of oracles) {
//         const oracleVal = await accountBalance(client, oracle);
//         if (oracleVal < 1) {
//           await sendPage("FUND", oracle, isMainnet);
//         }
//       }
//     } catch (e) {
//       await sendPage(e.stack.toString(), "Pager failure", false);
//       res.send(`${e.stack.toString()}`);
//     }
//     return;
//   }
export const whiteListedAdresses = [];

export const configList: any = {
  defaultPdKey: {
    mainnet: "dc6aa95f95d74b02c0b7c9e23d59cfcc",
    testnet: "faafe60385384309c077ed61303e50d0",
    devnet: "faafe60385384309c077ed61303e50d0",
  },
  aptos: {
    mainnet: {
      pid: "0x7d7e436f0b2aafde60774efb26ccc432cf881b677aca7faaf2a01879bd19fb8",
      rpc: "https://aptos-api.rpcpool.com/8f545350616dc47e67cfb35dc857/v1",
      rpcs: ["https://aptos-api.rpcpool.com/8f545350616dc47e67cfb35dc857/v1"],
      pdKey: "dc6aa95f95d74b02c0b7c9e23d59cfcc",
    },
    testnet: {
      pid: "0xb91d3fef0eeb4e685dc85e739c7d3e2968784945be4424e92e2f86e2418bf271",
      rpc: "https://aptos-testnet.blastapi.io/6f080338-a36f-43a7-b869-b64a65468518/v1",
      rpcs: [
        "https://aptos-testnet.blastapi.io/6f080338-a36f-43a7-b869-b64a65468518/v1",
      ],
      pdKey: "45ed6df85e544600c01702d353a5e708",
    },
  },
  arbitrum: {
    mainnet: {
      pid: "0xC29aAabf235c1E71633fb7365E95772B97F425d7", //"TODO: confirm",
      rpc: "https://switchbo-switchbo-1652.mainnet.arbitrum.rpcpool.com/ffc1b5b6-bb04-4334-ac89-1034cd57e86e",
      rpcs: [
        "https://switchbo-switchbo-1652.mainnet.arbitrum.rpcpool.com/ffc1b5b6-bb04-4334-ac89-1034cd57e86e",
      ],
    },
    testnet: {
      pid: "0x4D06F949eb1057EB86446532eDf1cF323e787a8f", //"TODO: confirm",
      rpc: "https://goerli-rollup.arbitrum.io/rpc/",
      rpcs: ["https://goerli-rollup.arbitrum.io/rpc/"],
    },
  },
  coredao: {
    mainnet: {
      pid: "0xC29aAabf235c1E71633fb7365E95772B97F425d7", //"0x73d6C66874e570f058834cAA666b2c352F1C792D",
      rpc: "https://api.infstones.com/core/mainnet/56852b950678445da33434fa3539b274",
      rpcs: [
        "https://api.infstones.com/core/mainnet/56852b950678445da33434fa3539b274",
      ],
    },
    testnet: {
      pid: "0x4D06F949eb1057EB86446532eDf1cF323e787a8f", //"0x1bAB46734e02d25D9dF5EE725c0646b39C0c5224",
      rpc: "https://rpc.test.btcs.network/",
      rpcs: ["https://rpc.test.btcs.network/"],
    },
  },
  solana: {
    "mainnet-beta": {
      rpc: "https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a",
      rpcs: ["https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a"],
      pdKey: "dc6aa95f95d74b02c0b7c9e23d59cfcc",
    },
    devnet: {
      rpc: "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14",
      rpcs: [
        "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14",
      ],
      pdKey: "faafe60385384309c077ed61303e50d0",
    },
  },
  sui: {
    mainnet: {
      pid: "0xfd2e0f4383df3ec9106326dcd9a20510cdce72146754296deed15403fcd3df8b",
      rpcs: ["https://mainnet.sui.rpcpool.com"],
      pdKey: "dc6aa95f95d74b02c0b7c9e23d59cfcc",
    },
    testnet: {
      pid: "0x271beaa1f36bf8812a778f0df5a7a9f67a757008512096862a128c42923671e2",
      rpc: "https://testnet.sui.rpcpool.com",
      rpcs: ["https://testnet.sui.rpcpool.com"],
      pdKey: "45ed6df85e544600c01702d353a5e708",
    },
  },
  near: {
    mainnet: {
      pid: "sbv2-authority.near",
      rpc: "https://rpc.mainnet.near.org",
      rpcs: ["https://rpc.mainnet.near.org"],
      pdKey: "dc6aa95f95d74b02c0b7c9e23d59cfcc",
    },
    testnet: {
      pid: "sbv2-authority.testnet",
      rpc: "https://rpc.testnet.near.org",
      rpcs: ["https://rpc.testnet.near.org"],
      pdKey: "faafe60385384309c077ed61303e50d0",
    },
  },
  starknet: {
    mainnet: {
      feedPusher:
        "0x02b5ebc4a7149600ca4890102bdb6b7d6daac2fbb9d9ccd01f7198ca29107ec4",
      pid: "0x0728d32b3d508dbe5989824dd0edb1e03b8a319d561b9ec6507dff245a95c52f",
      rpc: "https://starknet-mainnet.infura.io/v3/01c29215e2f2486e8480edf1d74903bf",
      rpcs: [
        "https://starknet-mainnet.infura.io/v3/01c29215e2f2486e8480edf1d74903bf",
      ],
      pdKey: "dc6aa95f95d74b02c0b7c9e23d59cfcc",
    },
    testnet: {
      feedPusher:
        "0x014d660768cb98256ceb18d821fd02fd1b54b6028679ceca3dbe03389228f285",
      pid: "0x026183fd8df673e4b2a007eec9d70bc38eb8a0df960dd5b0c57a9250ae2e63ac",
      rpc: "https://starknet-goerli.infura.io/v3/01c29215e2f2486e8480edf1d74903bf",
      rpcs: [
        "https://starknet-goerli.infura.io/v3/01c29215e2f2486e8480edf1d74903bf",
      ],
      pdKey: "faafe60385384309c077ed61303e50d0",
    },
  },
};

const devnetPDKey = "faafe60385384309c077ed61303e50d0";
const mainnetPDKey = "dc6aa95f95d74b02c0b7c9e23d59cfcc";

/*
  const parsedUrl = url.parse(req.url, true);
  const params = parsedUrl.query;
  for (const key in params) {
    console.log(key + ': ' + params[key]);
  }
  */
