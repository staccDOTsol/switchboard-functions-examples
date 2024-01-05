import type { IJobContext } from "../types/JobContext.js";

import { Big, OracleJob } from "@switchboard-xyz/common";
import * as sbv2 from "@switchboard-xyz/solana.js";
import cronParser from "cron-parser";

/**
 * Return a timestamp from a crontab instruction.
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iCronParseTask] An CronParseTask to run.
 * @throws {String}
 * @returns {Promise<Big>} big.js instance
 */
export async function cronParseTask(
  ctx: IJobContext,
  iCronParseTask: OracleJob.ICronParseTask
): Promise<Big> {
  const cronParseTask = OracleJob.CronParseTask.fromObject(iCronParseTask);

  let now: number = Date.now();
  if (cronParseTask.clock === OracleJob.CronParseTask.ClockType.SYSCLOCK) {
    now =
      (
        await sbv2.SolanaClock.fetch(ctx.solanaMainnetConnection)
      ).unixTimestamp.toNumber() * 1000;
  }

  const parser = cronParser.parseExpression(cronParseTask.cronPattern, {
    currentDate: now + (cronParseTask.clockOffset ?? 0) * 1000,
    iterator: true,
    utc: true,
  });

  const nextDate = parser.next().value.toDate();
  return new Big(nextDate.getTime() / 1000);
}
