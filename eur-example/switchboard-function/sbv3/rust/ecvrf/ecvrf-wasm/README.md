# ecvrf-wasm

A JS compatibile compiled web assembly module (WASM) to prove and verify a
verifiable random function for use on Solana.

## Install

```
npm i --save @switchboard-xyz/ecvrf-wasm
```

## Usage

To calculate a VRF proof

```ts
import ecvrf from "@switchboard-xyz/ecvrf-wasm";
import { Keypair } from "@solana/web3.js";

// oracle's secret key
let producerKeypair: Keypair;
// sourced from vrf.currentRound.alpha as Buffer converted to hex string
let alphaHex: string; 
const secretHex: string = Buffer.from(
  producerKeypair.secretKey.slice(0, producerKeypair.secretKey.length - 32)
).toString("hex");

const proofHexString: string = ecvrf.ecvrf_prove(secretHex, alphaHex);
console.log(`PROOF = ${proofHexString}`);
```

To verify a VRF proof

```ts
import ecvrf from "@switchboard-xyz/ecvrf-wasm";
import { PublicKey } from "@solana/web3.js";

// oracle's public key
let producerPubkey: PublicKey;
// sourced from vrf.builders[0].reprProof as Buffer converted to hex string
let proofHex: string;
// sourced from vrf.currentRound.alpha as Buffer converted to hex string
let alphaHex: string;

const verified: boolean = ecvrf.ecvrf_verify(
  producerPubkey.toBuffer().toString("hex"),
  proofHex,
  alphaHex
);
if (!verified) {
  throw new Error(`VRF proof was not verified`);
}
```
