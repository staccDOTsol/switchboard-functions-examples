import type { IJobContext } from "../types/JobContext.js";

import { PublicKey } from "@solana/web3.js";
import type { Big } from "@switchboard-xyz/common";
import { OracleJob } from "@switchboard-xyz/common";

/**
 * Fetch the current swap price for a given liquidity pool
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iLpExchangeRateTask] An LpExchangeRateTask to run.
 * @throws {String}
 * @returns {Promise<Big>} Big.js object
 */
export async function lpExchangeRateTask(
  ctx: IJobContext,
  iLpExchangeRateTask: OracleJob.ILpExchangeRateTask
): Promise<Big> {
  const lpExchangeRateTask =
    OracleJob.LpExchangeRateTask.fromObject(iLpExchangeRateTask);
  if ((lpExchangeRateTask.mercurialPoolAddress?.length ?? 0) !== 0) {
    return ctx.clients.mercurial.calculateSwapPrice(
      lpExchangeRateTask.mercurialPoolAddress ?? "",
      lpExchangeRateTask.inTokenAddress ?? "",
      lpExchangeRateTask.outTokenAddress ?? ""
    );
  } else if ((lpExchangeRateTask.saberPoolAddress?.length ?? 0) !== 0) {
    const poolAddress = new PublicKey(lpExchangeRateTask.saberPoolAddress!);
    return ctx.clients.saber.calculateSwapPrice(poolAddress);
  } else if ((lpExchangeRateTask.raydiumPoolAddress?.length ?? 0) !== 0) {
    const poolAddress = new PublicKey(lpExchangeRateTask.raydiumPoolAddress!);
    return ctx.clients.raydium.calculateSwapPrice(poolAddress);
  } else if ((lpExchangeRateTask.orcaPoolTokenMintAddress?.length ?? 0) !== 0) {
    const poolAddress = new PublicKey(
      lpExchangeRateTask.orcaPoolTokenMintAddress! // being deprecating
    );
    return ctx.clients.orca.calculateSwapPrice(poolAddress);
  } else if ((lpExchangeRateTask.orcaPoolAddress?.length ?? 0) !== 0) {
    const poolAddress = new PublicKey(lpExchangeRateTask.orcaPoolAddress!);
    return ctx.clients.orca.calculateSwapPrice(poolAddress);
  } else if ((lpExchangeRateTask.portReserveAddress?.length ?? 0) !== 0) {
    const reserveAddress = new PublicKey(
      lpExchangeRateTask.portReserveAddress!
    );
    return ctx.clients.port.getLpExchangeRate(reserveAddress);
  }

  throw new Error("LpExchangeRateTaskError");
}
