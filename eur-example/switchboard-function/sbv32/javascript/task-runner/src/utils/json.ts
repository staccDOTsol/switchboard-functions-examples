import { PublicKey } from "@solana/web3.js";
import { Big, BN } from "@switchboard-xyz/common";

export function jsonReplacers(key: any, value: any): string {
  // big.js
  if (value instanceof Big) {
    return value.toString();
  }
  // pubkey
  if (value instanceof PublicKey) {
    return value.toBase58();
  }
  // BN
  if (BN.isBN(value)) {
    return value.toString(10);
  }
  // bigint
  if (typeof value === "bigint") {
    return value.toString(10);
  }

  // Fall through for nested objects
  return value;
}
