import type { AptosEnvironment } from "../env/AptosEnvironment";
import type { EVMEnvironment } from "../env/EVMEnvironment";
import type { NearEnvironment } from "../env/NearEnvironment";
import type { SolanaEnvironment } from "../env/SolanaEnvironment";
import type { SuiEnvironment } from "../env/SuiEnvironment";

import type { ChainType } from "@switchboard-xyz/common";

export type ChainEnvironment<T extends ChainType> = T extends "aptos"
  ? AptosEnvironment
  : T extends "near"
  ? NearEnvironment
  : T extends "solana"
  ? SolanaEnvironment
  : T extends "coredao"
  ? EVMEnvironment
  : T extends "arbitrum"
  ? EVMEnvironment
  : T extends "sui"
  ? SuiEnvironment
  : never;
