import { JupiterSwapError, JupiterSwapRateLimitExceeded } from "../errors.js";
import { httpResponseTimeout, maxResponseSizeAgent } from "../utils/http.js";
import { verboseLogger } from "../utils/misc.js";

import { unpackMint } from "@solana/spl-token";
import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { Big, BigUtils } from "@switchboard-xyz/common";
import type { Response } from "undici";
import { fetch } from "undici";
import { URL } from "url";

export type JupiterApiResult = Partial<{
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null;
  priceImpactPct: string;
  routePlan: RoutePlan[];
  contextSlot: number;
  timeTaken: number;
}>;

export type RoutePlan = Partial<{
  swapInfo: SwapInfo;
  percent: number;
}>;

export type SwapInfo = Partial<{
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}>;

export class JupiterSwap {
  // Used by mercurial when simulating a txn to calc if any new token accounts are needed
  static simulatedUser = new PublicKey(
    "D8d7xsLgV3sHxXQacA1vQfCharFXQzVmSeyMcHEenP52"
  );

  static baseUrl = `https://quote-api.jup.ag/v6`;

  private readonly apiKey: string | undefined;

  private tokenMintDecimals: Map<string, number> = new Map();

  private connection: Connection;

  private allSupportedDexes: Map<string, string>;

  constructor(mainnetConnection: Connection, _apiKey?: string) {
    this.connection = mainnetConnection;
    this.apiKey = _apiKey ?? process.env.JUPITER_SWAP_API_KEY;
    this.allSupportedDexes = new Map(
      [
        ...ALL_JUPITER_DEXES.map((l): [string, string] => [l, l]),
        ["raydium", "Raydium CLMM"],
        ["jupiter", "Jupiter LO"],
      ].map((row): [string, string] => [row[0].toLowerCase(), row[1]])
    );
  }

  private async getTokenDecimals(
    tokenMint: string | PublicKey
  ): Promise<number> {
    const tokenMintString =
      typeof tokenMint === "string" ? tokenMint : tokenMint.toBase58();
    const tokenMintPubkey =
      typeof tokenMint === "string" ? new PublicKey(tokenMint) : tokenMint;
    const cachedTokenMintDecimals = this.tokenMintDecimals.get(tokenMintString);
    if (cachedTokenMintDecimals) {
      return cachedTokenMintDecimals;
    }

    const tokenMintAccountInfo = await this.connection.getAccountInfo(
      tokenMintPubkey
    );
    if (!tokenMintAccountInfo || !tokenMintAccountInfo.data) {
      throw new Error(
        `Failed to fetch the tokenMints account Info for ${tokenMintString}`
      );
    }
    const mint = unpackMint(tokenMintPubkey, tokenMintAccountInfo);
    return mint.decimals;
  }

  private getExcludeList(allowList: string[], denyList: string[]): string[] {
    // if they set any allowed routes, exclude all the rest by default
    const excludedRoutes: Set<string> = new Set(
      allowList.length > 0 ? ALL_JUPITER_DEXES : []
    );

    for (const l of allowList) {
      const supportedRoute = this.allSupportedDexes.get(l.toLowerCase());
      if (supportedRoute && excludedRoutes.has(supportedRoute)) {
        excludedRoutes.delete(supportedRoute);
      }
    }

    for (const l of denyList) {
      const supportedRoute = this.allSupportedDexes.get(l.toLowerCase());
      if (supportedRoute) {
        excludedRoutes.add(supportedRoute);
      }
    }

    // Only allow DEXES supported by Jupiter
    return Array.from(excludedRoutes).filter((l) =>
      ALL_JUPITER_DEXES.includes(l)
    );
  }

  /** Calculate the jupiter swap price for a given input and output token */
  public async calculateSwapPrice(
    inTokenAddress: string,
    outTokenAddress: string,
    swapAmountDecimal: Big,
    swapType: "base" | "quote",
    allowList: string[],
    denyList: string[],
    slippage: number = 1
  ): Promise<Big> {
    if (!this.apiKey) {
      throw new Error(
        `Need to provide an API key to execute the jupiterSwapTask`
      );
    }

    const slippageBps = Math.round((slippage > 0 ? slippage : 1) * 100);

    const inputMint =
      swapType === "base"
        ? new PublicKey(inTokenAddress)
        : new PublicKey(outTokenAddress);
    const outputMint =
      swapType === "base"
        ? new PublicKey(outTokenAddress)
        : new PublicKey(inTokenAddress);

    const [inputDecimals, outputDecimals] = await Promise.all([
      this.getTokenDecimals(inputMint),
      this.getTokenDecimals(outputMint),
    ]);

    const swapAmount = BigUtils.safeMul(
      swapAmountDecimal,
      BigUtils.safePow(new Big(10), inputDecimals)
    );

    const excludeList = this.getExcludeList(allowList, denyList);

    const params = `quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${swapAmount}&slippageBps=${slippageBps}&onlyDirectRoutes=false${
      excludeList.length === 0 ? "" : `&excludeDexes=${excludeList.join(",")}`
    }`;

    const url = new URL(
      `${JupiterSwap.baseUrl}/${params}&token=${this.apiKey}`
    );
    console.log(`JupiterSwap: ${url.toString()}`);
    const response = await fetch(url, {
      method: "GET",
      dispatcher: maxResponseSizeAgent,
      keepalive: true,
      signal: AbortSignal.timeout(10_000),
    })
      .then((response) => {
        console.log(
          `JupiterSwap: (Status=${response.status}) ${response.statusText} - ${url}`
        );
        return response;
      })
      .catch((e) => {
        throw new JupiterSwapError(
          `JupiterSwapError: HttpError (${e}) - ${url}`
        );
      });

    if (response.status === 429) {
      throw new JupiterSwapRateLimitExceeded();
    } else if (!response.ok) {
      throw new JupiterSwapError(
        `JupiterSwapError: HttpError (Status=${response.status}): ${response.statusText} - ${url}`
      );
    }

    const responseObject: JupiterApiResult =
      (await response.json()) as unknown as JupiterApiResult;

    if (!responseObject.outAmount) {
      throw new Error(`Jupiter API did not yield an outAmount`);
    }

    if (
      responseObject.slippageBps &&
      responseObject.slippageBps > slippageBps
    ) {
      verboseLogger(
        `Slippage (${responseObject.slippageBps}) exceeded its bounds (${slippageBps})`
      );
    }

    //  Handle the decimal place conversion here
    return BigUtils.safeDiv(
      new Big(responseObject.outAmount),
      BigUtils.safePow(new Big(10), outputDecimals)
    );
  }
}

const ALL_JUPITER_DEXES = [
  "Lifinity V1",
  "Marinade",
  "Meteora",
  "Penguin",
  "Mercurial",
  "Oasis",
  "Phoenix",
  "Raydium",
  "Jupiter LO",
  "Openbook",
  "StepN",
  "Raydium CLMM",
  "Aldrin V2",
  "Symmetry",
  "Lifinity V2",
  "Bonkswap",
  "Cropper",
  "Balansol",
  "Sanctum",
  "Saber",
  "Invariant",
  "Helium Network",
  "Saros",
  "Orca V1",
  "Crema",
  "Saber (Decimals)",
  "Orca V2",
  "Whirlpool",
  "Aldrin",
  "FluxBeam",
];
