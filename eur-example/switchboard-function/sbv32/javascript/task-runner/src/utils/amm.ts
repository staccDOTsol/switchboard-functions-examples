import { verboseLogger } from "./misc.js";

import * as spl from "@solana/spl-token";
import type { Connection } from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";
import { Big, BigUtils, BN } from "@switchboard-xyz/common";
import * as sbv2 from "@switchboard-xyz/solana.js";

export class TokenAmount {
  _big?: Big;
  _switchboardDecimal?: sbv2.types.SwitchboardDecimal;
  _bn?: BN;

  constructor(readonly amount: bigint, readonly decimals: number) {}

  toBig(): Big {
    return BigUtils.safeDiv(
      new Big(this.amount.toString()),
      BigUtils.safePow(new Big(10), this.decimals)
    );
  }

  get big(): Big {
    if (!this._big) {
      this._big = this.toBig();
    }
    return this._big;
  }

  get raw(): bigint {
    return this.amount;
  }

  get bn(): BN {
    if (!this._bn) {
      this._bn = new BN(this.amount.toString());
    }
    return this._bn;
  }

  get switchboardDecimal(): sbv2.types.SwitchboardDecimal {
    if (!this._switchboardDecimal) {
      this._switchboardDecimal = new sbv2.types.SwitchboardDecimal({
        mantissa: new BN(this.amount.toString()),
        scale: this.decimals,
      });
    }
    return this._switchboardDecimal;
  }

  toJSON() {
    return {
      amount: this.amount.toString(),
      decimals: this.decimals,
      uiAmount: this.big.toNumber(),
      uiAmountString: this.big.toString(),
    };
  }

  toString() {
    return this.big.toString();
  }

  //   add(b: TokenAmount): TokenAmount {
  //     const scale = Math.max(this.decimals, b.decimals)
  //     const aScaled =
  //   }
}

class StableCurveUtils {
  computeD(amp: number, amounts: bigint[]): bigint {
    // Adapted from @orca-so/stablecurve
    // d = (leverage * sum_x + d_product * n_coins) * initial_d / ((leverage - 1) * initial_d + (n_coins + 1) * d_product)
    const calculateStep = (
      initialD: bigint,
      leverage: number,
      sumX: bigint,
      dProduct: bigint,
      N_COINS: number
    ): bigint => {
      const leverageMul = BigInt(leverage) * sumX;
      const dPMul = dProduct * BigInt(N_COINS);

      const leverageVal = (leverageMul + dPMul) * initialD;

      const leverageSub = initialD * BigInt(leverage - 1);
      const nCoinsSum = dProduct * BigInt(N_COINS + 1);

      const rVal = leverageSub + nCoinsSum;

      return leverageVal / rVal;
    };

    const N_COINS = amounts.length;
    const leverage = amp * N_COINS;
    const amountsTimesN = amounts.map((r) => r * BigInt(N_COINS) + BigInt(1));
    const sumX = amounts.reduce((prev, curr) => prev + curr, BigInt(0));

    if (sumX === BigInt(0)) {
      return BigInt(0);
    }

    let dPrevious: bigint;
    let d = sumX;

    for (let i = 0; i < 32; i++) {
      const dProduct = d;
      amountsTimesN.reduce((prev, curr) => (prev * d) / curr, dProduct);
      dPrevious = d;
      d = calculateStep(d, leverage, sumX, dProduct, N_COINS);
      if (d === dPrevious) {
        break;
      }
    }

    return d;
  }

  calculateVirtualPrice(
    ampFactor: number,
    lpPool: TokenAmount,
    reserves: TokenAmount[]
  ): Big {
    const scale = Math.max(lpPool.decimals, ...reserves.map((r) => r.decimals));
    const normalizedReserves = reserves.map(
      (r) => r.amount * (BigInt(10) ^ BigInt(scale - r.decimals))
    );
    const D = this.computeD(ampFactor, normalizedReserves);

    const virtualPrice = BigUtils.safeDiv(
      BigUtils.safeDiv(
        new Big(D.toString()),
        new Big(lpPool.amount.toString())
      ),
      BigUtils.safePow(new Big(10), scale - lpPool.decimals + 1)
    );

    verboseLogger(
      `${virtualPrice} = ${D} / ${lpPool.amount} / 10^(${
        scale - lpPool.decimals + 1
      })`,
      "StableSwap",
      "VirtualPrice"
    );

    return virtualPrice;
  }

  /**
   * https://blog.chain.link/using-chainlink-oracles-to-securely-utilize-curve-lp-pools/
   * P_LP = P_MIN * P_VIRTUAL
   */
  calculateFairLpPrice(
    ampFactor: number,
    totalSupply: TokenAmount,
    reserves: TokenAmount[],
    prices: Big[]
  ): Big {
    if (reserves.length !== prices.length || reserves.length === 0) {
      throw new Error(
        `must provide equal number of reserves (${reserves.length}) and prices (${prices.length}) to calc fair Lp token price`
      );
    }
    verboseLogger(
      `[${reserves.map((r) => r.toString())}] ${BigUtils.safeMul(
        BigUtils.safeDiv(
          reserves[0].big.mul(prices[0]),
          reserves[0].big.mul(prices[0]).add(reserves[1].big.mul(prices[1]))
        ),
        new Big(100)
      ).toFixed(2)}%`,
      "StableSwap",
      "Reserves"
    );

    const virtualPrice = this.calculateVirtualPrice(
      ampFactor,
      totalSupply,
      reserves
    );

    const sortedPrices = prices.sort((a, b) => a.cmp(b));
    if (!sortedPrices || sortedPrices.length <= 0) {
      throw new Error("EmptyPriceError");
    }
    const minPrice = sortedPrices[0];

    const fairLpPrice = BigUtils.safeMul(minPrice, virtualPrice);

    verboseLogger(
      `${fairLpPrice} = ${minPrice} * ${virtualPrice}`,
      "StableSwap",
      "LpPrice"
    );

    return fairLpPrice;
  }
}

class ConstantProductUtils {
  /*
   * https://blog.alphafinance.io/fair-lp-token-pricing/
   * P_LP = (N * (R1*R2*RN)^1/N * (P1*P2*PN)^1/N) / R_LP
   */
  calculateFairLpPrice(
    totalSupply: TokenAmount,
    reserves: TokenAmount[],
    prices: Big[]
  ): Big {
    if (reserves.length !== prices.length || reserves.length === 0) {
      throw new Error(
        `must provide equal number of reserves (${reserves.length}) and prices (${prices.length}) to calc fair Lp token price`
      );
    }

    verboseLogger(
      `[${reserves.map((r) => r.toString())}] ${BigUtils.safeMul(
        BigUtils.safeDiv(
          reserves[0].big.mul(prices[0]),
          reserves[0].big.mul(prices[0]).add(reserves[1].big.mul(prices[1]))
        ),
        new Big(100)
      ).toFixed(2)}%`,
      "ConstantProduct",
      "Reserves"
    );

    const N = reserves.length;
    const K = BigUtils.safeNthRoot(
      BigUtils.safeMul(...reserves.map((r) => r.big)),
      N
    );
    const P = BigUtils.safeNthRoot(BigUtils.safeMul(...prices), N);
    const numerator = BigUtils.safeMul(new Big(N), K, P);
    const result = BigUtils.safeDiv(numerator, totalSupply.big);

    verboseLogger(
      `${result} = ${N} * (${reserves
        .map((r) => r.big)
        .join("*")})^0.5 * (${prices.join("*")})^0.5 / ${
        totalSupply.big
      } = ${numerator} / ${totalSupply.big}`,
      "ConstantProduct",
      "LpPrice"
    );

    return result;
  }

  /**
   * X * Y = K
   * P = Y / X
   */
  calculateSwapPrice(base: TokenAmount, quote: TokenAmount): Big {
    const swapPrice = BigUtils.safeDiv(quote.big, base.big);
    verboseLogger(
      `${swapPrice} = ${quote.big} / ${base.big}`,
      "ConstantProduct",
      "SwapPrice"
    );
    return swapPrice;
  }
}

export class AmmUtils {
  static stableCurve = new StableCurveUtils();
  static constantProduct = new ConstantProductUtils();

  static async fetchSplAccounts(
    connection: Connection,
    mints?: PublicKey[],
    accounts?: PublicKey[]
  ): Promise<{
    mints: spl.Mint[];
    accounts: spl.Account[];
  }> {
    const allKeys: PublicKey[] = [];
    if (mints && mints.length > 0) {
      allKeys.push(...mints);
    }
    if (accounts && accounts.length > 0) {
      allKeys.push(...accounts);
    }
    if (allKeys.length === 0) {
      throw new Error(`No public keys provided to fetchAccounts`);
    }

    const allAccountInfos = await connection.getMultipleAccountsInfo(allKeys);

    const rawMints: spl.Mint[] = [];
    const mintAccountInfos = allAccountInfos.slice(0, mints?.length ?? 0);
    if (mintAccountInfos?.length ?? 0) {
      rawMints.push(
        ...mintAccountInfos.map((accountInfo, i) => {
          if (!accountInfo) {
            throw new Error(`Failed to fetch mint`);
          }
          const mint = spl.unpackMint(allKeys[i], accountInfo);
          return mint;
        })
      );
    }

    const accountOffset = mints?.length ?? 0;
    const rawAccounts: spl.Account[] = [];
    const accountAccountInfos = allAccountInfos.slice(accountOffset);
    if (accountAccountInfos?.length ?? 0) {
      rawAccounts.push(
        ...accountAccountInfos.map((accountInfo, i) => {
          if (!accountInfo) {
            throw new Error(`Failed to fetch account`);
          }
          const account = spl.unpackAccount(
            allKeys[i + accountOffset],
            accountInfo
          );
          return account;
        })
      );
    }

    return {
      mints: rawMints,
      accounts: rawAccounts,
    };
  }
}
