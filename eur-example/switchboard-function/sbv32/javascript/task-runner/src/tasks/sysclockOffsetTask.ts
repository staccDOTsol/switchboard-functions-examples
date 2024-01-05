import type { IJobContext } from "../types/JobContext.js";

import type { Big, OracleJob } from "@switchboard-xyz/common";
import { BigUtils, BN } from "@switchboard-xyz/common";
import * as sbv2 from "@switchboard-xyz/solana.js";

/**
 * Return the difference between an oracle's clock and the current timestamp at SYSVAR_CLOCK_PUBKEY.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iSysclockOffsetTask] A SysclockOffsetTask to run.
 * @throws {String}
 * @returns {Promise<Big>} The on-chain clock drift
 */
export async function sysclockOffsetTask(
  ctx: IJobContext,
  iSysclockOffsetTask: OracleJob.ISysclockOffsetTask
): Promise<Big> {
  const oracleTimestamp = new BN(Math.floor(+Date.now() / 1000));
  const sysClock = await sbv2.SolanaClock.fetch(
    ctx.program.provider.connection
  );
  const drift = oracleTimestamp.sub(sysClock.unixTimestamp);
  return BigUtils.fromBN(drift);
}
