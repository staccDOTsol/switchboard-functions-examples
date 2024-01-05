import type { OrcaU64 } from "@orca-so/sdk";
import type * as raydium from "@raydium-io/raydium-sdk";
import type {
  Fraction,
  Price,
  TokenAmount as SaberTokenAmount,
} from "@saberhq/token-utils";
import type { TokenAmount } from "@solana/web3.js";
import { Big, BigUtils, BN } from "@switchboard-xyz/common";

export function fromOrcaU64(u64: OrcaU64): Big {
  return BigUtils.fromBN(new BN(u64.value.toBuffer()), u64.scale);
}

export function fromSaberTokenAmount(token: SaberTokenAmount): Big {
  return BigUtils.fromBN(new BN(token.toString()), token.token.info.decimals);
}

export function fromTokenAmount(token: TokenAmount): Big {
  return BigUtils.fromBN(new BN(token.amount), token.decimals);
}

export function fromPrice(price: Price | Fraction): Big {
  const numerator = new Big(price.numerator.toString());
  const denominator = new Big(price.denominator.toString());
  return BigUtils.safeDiv(numerator, denominator);
}

export function fromRaydiumPrice(price: raydium.Price): Big {
  const numerator = BigUtils.safeMul(
    new Big(price.numerator.toString()),
    BigUtils.safePow(new Big(10), price.baseCurrency.decimals)
  );
  const denominator = BigUtils.safeMul(
    new Big(price.denominator.toString()),
    BigUtils.safePow(new Big(10), price.quoteCurrency.decimals)
  );

  return BigUtils.safeDiv(numerator, denominator);
}
