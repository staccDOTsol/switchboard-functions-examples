<div align="center">

![Switchboard Logo](https://github.com/switchboard-xyz/sbv2-core/raw/main/website/static/img/icons/switchboard/avatar.png)

# @switchboard-xyz/sui.js

> A Typescript client to interact with Switchboard V2 on Sui.

[![NPM Badge](https://img.shields.io/github/package-json/v/switchboard-xyz/sbv2-sui?color=red&filename=javascript%2Fsui.js%2Fpackage.json&label=%40switchboard-xyz%2Fsui.js&logo=npm)](https://www.npmjs.com/package/@switchboard-xyz/sui.js)

</div>

## Install

```bash
npm i --save @switchboard-xyz/sui.js
```

## Usage

**Directory**

- [Reading Feeds](#reading-feeds)
- [Creating Feeds](#creating-feeds)

### Reading Feeds

```ts
import { AggregatorAccount } from "@switchboard-xyz/sui.js";

const aggregatorAccount: AggregatorAccount = new AggregatorAccount(
  client,
  aggregator_address,
  SWITCHBOARD_ADDRESS
);

console.log(await aggregatorAccount.loadData());
```

### Creating Feeds

```ts
import { Buffer } from "buffer";
import { OracleJob, createFeed } from "@switchboard-xyz/sui.js";
import Big from "big.js";
import {
Ed25519Keypair,
JsonRpcProvider,
devnetConnection,
} from "@mysten/sui.js";

// devnet address
const SWITCHBOARD_ADDRESS = "0x23ecb0df7bed0b4048f939298c9a179973e13d4e";
const QUEUE_ADDRESS = "0xacbb5327b76a6980495f4f3b7482c7f6cc5a4791";

// keypair
const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(/** YOUR KEYPAIR IMPORT GOES HERE **/, "hex"));

// Make Job data for btc price
const serializedJob = Buffer.from(
OracleJob.encodeDelimited(
  OracleJob.create({
    tasks: [
      {
        httpTask: {
          url: "https://www.binance.us/api/v3/ticker/price?symbol=BTCUSD",
        },
      },
      {
        jsonParseTask: {
          path: "$.price",
        },
      },
    ],
  })
).finish()
);

const coins = await provider.selectCoinsWithBalanceGreaterThanOrEqual(
userAddress,
BigInt(10000000)
);

const coin: any = coins.pop();

const [aggregator, createFeedTx] = await createFeed(
provider,
keypair, // you will need to import a Sui Payer Keypair
{
  name: "BTC/USD",
  authority: userAddress,
  queueAddress: queue.address,
  batchSize: 1,
  minJobResults: 1,
  minOracleResults: 1,
  minUpdateDelaySeconds: 5,
  varianceThreshold: new Big(0),
  forceReportPeriod: 0,
  coinType: "0x2::sui::SUI",
  initialLoadAmount: 1,
  loadCoin: coin.details.reference.objectId,
  jobs: [
    {
      name: "BTC/USD",
      data: Array.from(serializedJob1),
      weight: 1,
    },
  ],
},
SWITCHBOARD_ADDRESS
);

console.log(`Created Aggregator address ${aggregator.address}.`);
```
