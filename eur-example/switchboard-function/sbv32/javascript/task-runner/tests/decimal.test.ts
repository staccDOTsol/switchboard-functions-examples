import * as anchor from "@coral-xyz/anchor";
import type { TokenInfo } from "@saberhq/token-utils";
import { Token } from "@saberhq/token-utils";
import { Big, BigUtils } from "@switchboard-xyz/common";
import Decimal from "decimal.js";

describe("Decimal tests", () => {
  it("Perform safe Big.js division", async () => {
    Big.DP = 0;
    const big = new Big("1337.1337");
    const squared = big.pow(2);
    const result = BigUtils.safeDiv(squared, big);
    expect(result.toNumber()).toBe(big.toNumber());
  });

  it("Perform safe Big.js multiplication", async () => {
    Big.DP = 0;
    const big = new Big("1337.1337");
    const squared = big.pow(3);
    const mul = BigUtils.safeMul(big, big, big);
    expect(mul.toNumber()).toBe(squared.toNumber());
  });

  it("Perform safe nth root", async () => {
    Big.DP = 0;
    let num = 1337.1337;
    let big = new Big(num);
    let pow = big.pow(5);
    let result = BigUtils.safeNthRoot(pow, 5);
    expect(result.toNumber()).toBe(num);

    num = -122.45;
    big = new Big(num);
    pow = big.pow(3);
    result = BigUtils.safeNthRoot(pow, 3);
    expect(result.toNumber()).toBe(num);

    num = -122.45;
    big = new Big(num);
    pow = big.pow(4);
    result = BigUtils.safeNthRoot(pow, 4);
    expect(result.toNumber()).toBe(Math.abs(num));

    num = 2;
    big = new Big(num);
    pow = new Big("2.82843");
    result = BigUtils.safeNthRoot(pow, 1.5);
    expect(result.prec(1).toNumber()).toBe(Math.abs(num));

    const negNthRoot = () => {
      result = BigUtils.safeNthRoot(new Big(12213122.21), -4);
    };
    expect(negNthRoot).toThrow(Error);

    const zeroNthRoot = () => {
      result = BigUtils.safeNthRoot(new Big(12213122.21), 0);
    };
    expect(zeroNthRoot).toThrow(Error);
  });

  it("Convert decimal.js to big.js", async () => {
    let dec = new Decimal("123456789123456789.123456789");
    let result: Big = BigUtils.fromDecimal(dec);
    expect(result.toNumber()).toBe(dec.toNumber());

    dec = new Decimal("-302123.23");
    result = BigUtils.fromDecimal(dec);
    expect(result.toNumber()).toBe(dec.toNumber());

    dec = new Decimal(0);
    result = BigUtils.fromDecimal(dec);
    expect(result.toNumber()).toBe(dec.toNumber());

    const myNaN = () => {
      dec = new Decimal("NaN");
      result = BigUtils.fromDecimal(dec);
    };
    expect(myNaN).toThrow(TypeError);

    const INF = () => {
      dec = new Decimal("Infinity");
      result = BigUtils.fromDecimal(dec);
    };
    expect(INF).toThrow(TypeError);
  });

  it("Convert big.js to decimal.js", async () => {
    let big = new Big("123456789123456789.123456789");
    let result: Decimal = BigUtils.toDecimal(big);
    expect(result.toNumber()).toBe(big.toNumber());

    big = new Big("-302123.23");
    result = BigUtils.toDecimal(big);
    expect(result.toNumber()).toBe(big.toNumber());

    big = new Big("0");
    result = BigUtils.toDecimal(big);
    expect(result.toNumber()).toBe(big.toNumber());

    big = new Big("1.9392324332");
    result = BigUtils.toDecimal(big);
    expect(result.toNumber()).toBe(big.toNumber());
  });

  it("Convert anchor.BN to big.js", async () => {
    let expectResult = 42652;
    let bn = new anchor.BN("42652");
    let result: Big = BigUtils.fromBN(bn);
    expect(result.toNumber()).toBe(expectResult);

    expectResult = -302123;
    bn = new anchor.BN("-302123");
    result = BigUtils.fromBN(bn);
    expect(result.toNumber()).toBe(expectResult);

    bn = new anchor.BN("123456789123456789123456789123456789");
    result = BigUtils.fromBN(bn);
    expect(bn.cmp(new anchor.BN(result.toFixed()))).toBe(0);
  });

  it("Convert TokenAmount to big.js", async () => {
    const expecedResult = "0.123456789";
    const info: TokenInfo = {
      chainId: 102,
      address: "So11111111111111111111111111111111111111112",
      symbol: "wSOL",
      name: "Wrapped SOL",
      decimals: 9,
    };
    const token = new Token(info);
    // const dummyToken = new TokenAmount(token, new anchor.BN("123456789"));
    // let result: Big = BigUtils.fromTokenAmount(dummyToken);
    // expect(result.toString() === expecedResult);
  });
});
