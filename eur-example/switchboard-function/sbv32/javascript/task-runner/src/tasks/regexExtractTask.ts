import type { IJobContext } from "../types/JobContext.js";

import type { OracleJob } from "@switchboard-xyz/common";

/**
 * Parse an input and return the string match
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iRegexExtractTask] A RegexExtractTask to run.
 * @throws {String}
 * @returns {Promise<string>} A string match
 */
export async function regexExtractTask(
  ctx: IJobContext,
  iRegexExtractTask: OracleJob.IRegexExtractTask
): Promise<string> {
  const input = ctx.result.toString();
  if (!input) {
    throw new Error(`RegexExtractTask: No input provided`);
  }
  const pattern = new RegExp(iRegexExtractTask.pattern ?? "");
  const matches = input.match(pattern) ?? [];

  const groupNumber = iRegexExtractTask.groupNumber ?? 0;
  if (matches && groupNumber < matches.length) {
    return matches[groupNumber];
  }
  throw new Error(`RegexExtractTask: group number "${groupNumber}" not found.`);
}
