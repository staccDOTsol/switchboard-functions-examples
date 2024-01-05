//import { checkAptosFeed } from "./aptos-pager";
import { checkAptosFeed } from "./aptos-pager";
import { checkNearFeed } from "./near-pager";
import { checkSolana } from "./solana-pager";

import * as functions from "@google-cloud/functions-framework";
import { MintMismatch } from "@switchboard-xyz/near.js/lib/cjs/generated/index.js";
import express from "express";
import * as url from "url";
// import { checkSuiFeed, checkSuiBalance } from "./sui-pager";
// import { checkCoredaoFeed, checkCoredaoBalance } from "./coredao-pager";

export const app: ReturnType<typeof express> = express();

//exports.myFunction = app;
app.get("/:chain/:network/check/balance/", async (req, res) => {
  const address = req.query.address!.toString();
  const chain = req.params.chain;
  const network = req.params.network;
  const name = req.query.name; //name to include with pages for insufficient balance
  const nodeUrl = configList[chain][network].rpc;
  const pid = configList[chain][network].pid;
  console.log(
    `got request: (address: ${address}, chain: ${chain}, network: ${network})`
  );

  // let pdKey = configList[chain][network].pdKey
  // if (pdKey == null){
  //     pdKey = configList.defaultPdKey[network];
  // }
  switch (chain) {
    case "aptos":
    case "arbitrum":
    case "coredao":
    case "near":
    case "solana":
    case "sui":
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
    case "coredao":
    case "near":
      try {
        const result = await checkNearFeed(address, minTillStale, network);
        console.log("near check feed result: " + result);
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
  }
});
app.get("/", (req, res, next) => {
  res.status(200).send("hello world!");
});

// app.listen(process.env.PORT, () => {
//   console.log("server connected!");
// });

// exports.checkChain = app;
functions.http("checkChain", app);

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

curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/mainnet/check/staleness/?minTillStale=90&address=8Zn42dJjp75PUyPSwWFzoUDHcGKGL5VBX5Y3A6HivVrR
curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/mainnet/check/staleness/?minTillStale=90&address=2C7EGwUgRdSof2ReXWi2zaQW7fLBBDnZJSizW1ptEFTL
curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/mainnet/check/staleness/?minTillStale=90&address=C3p8SSWQS8j1nx7HrzBBphX5jZcS1EY28EJ5iwjzSix2
curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/mainnet/check/staleness/?minTillStale=90&address=9pb1mXfUWTZKE9wgGW4uJw9bKobrVANkPRsqzBakfL6E

curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/aptos/mainnet/check/staleness/?minTillStale=90&address=0x4531f956f68ccf05ab29a1db5e73f7c828af5f42f2018b3a74bf934e81fef80f

curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/solana/mainnet-beta/check/staleness/?minTillStale=90&address=BnT7954eT3UT4XX5zf9Zwfdrag5h3YmzG8LBRwmXo5Bi
curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/solana/devnet/check/staleness/?minTillStale=90&address=8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee


curl https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/testnet/check/staleness?address=21EKutL6JAudcS2MVvfgvCsKqxLNovy72rqpwo4gwzfR&minTillStale=5
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
    },
    testnet: {
      pid: "0xb91d3fef0eeb4e685dc85e739c7d3e2968784945be4424e92e2f86e2418bf271",
      rpc: "https://aptos-testnet.blastapi.io/6f080338-a36f-43a7-b869-b64a65468518/v1",
      pdKey: "45ed6df85e544600c01702d353a5e708",
    },
  },
  coredao: {
    mainnet: {
      pid: "0x73d6C66874e570f058834cAA666b2c352F1C792D",
      rpc: "https://api.infstones.com/core/mainnet/56852b950678445da33434fa3539b274",
    },
    testnet: {
      pid: "0x1bAB46734e02d25D9dF5EE725c0646b39C0c5224",
      rpc: "https://rpc.test.btcs.network/",
    },
  },
  solana: {
    "mainnet-beta": {
      rpc: "https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a",
      pdKey: "dc6aa95f95d74b02c0b7c9e23d59cfcc",
    },
    devnet: {
      rpc: "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14",
      pdKey: "faafe60385384309c077ed61303e50d0",
    },
  },
  sui: {
    mainnet: {
      pid: "0xfd2e0f4383df3ec9106326dcd9a20510cdce72146754296deed15403fcd3df8b",
      rpc: "https://mainnet.sui.rpcpool.com",
      pdKey: "dc6aa95f95d74b02c0b7c9e23d59cfcc",
    },
    testnet: {
      pid: "0x271beaa1f36bf8812a778f0df5a7a9f67a757008512096862a128c42923671e2",
      rpc: "https://testnet.sui.rpcpool.com",
      pdKey: "45ed6df85e544600c01702d353a5e708",
    },
  },
  near: {
    mainnet: {
      pid: "sbv2-authority.near",
      rpc: "https://rpc.mainnet.near.org",
    },
    testnet: {
      pid: "sbv2-authority.testnet",
      rpc: "https://rpc.testnet.near.org",
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
