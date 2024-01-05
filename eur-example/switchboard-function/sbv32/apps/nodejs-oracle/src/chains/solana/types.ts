import type { Commitment, ConfirmOptions } from "@solana/web3.js";

export const DEFAULT_CONFIRM_OPTIONS: ConfirmOptions = {
  maxRetries: 10,
  skipPreflight: true,
};

export const DEFAULT_COMMITMENT: Commitment = "processed";
