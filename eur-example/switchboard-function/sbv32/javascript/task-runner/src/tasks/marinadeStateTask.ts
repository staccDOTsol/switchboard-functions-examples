import type { IJobContext } from "../types/JobContext.js";
import { jsonReplacers } from "../utils/json.js";

import type { OracleJob } from "@switchboard-xyz/common";

/**
 *
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iMarinadeStateTask] A MarinadeStateTask to run.
 * @throws {String}
 * @returns {Promise<string>}
 */
export async function marinadeStateTask(
  ctx: IJobContext,
  iMarinadeStateTask: OracleJob.IMarinadeStateTask
): Promise<string> {
  const marinadeState = await ctx.clients.marinade.getMarinadeState();
  const marinadeStateStr = JSON.stringify(marinadeState.state, jsonReplacers);
  return marinadeStateStr;
}
