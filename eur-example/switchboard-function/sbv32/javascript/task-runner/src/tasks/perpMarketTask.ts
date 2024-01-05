import type { IJobContext } from "../types/JobContext.js";
import type { ITaskResult } from "../types/TaskResult.js";

import type { OracleJob } from "@switchboard-xyz/common";

export function perpMarketTask(
  ctx: IJobContext,
  iTask: OracleJob.IPerpMarketTask
): ITaskResult {
  throw new Error(`perpMarketTask is not implemented`);
}
