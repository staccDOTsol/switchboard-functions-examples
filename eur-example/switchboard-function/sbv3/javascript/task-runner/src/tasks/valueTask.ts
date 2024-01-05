import type { IJobContext } from "../types/JobContext.js";

import { PublicKey } from "@solana/web3.js";
import { Big, OracleJob } from "@switchboard-xyz/common";
import * as sbv2 from "@switchboard-xyz/solana.js";

/**
 * Return a static value
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iValueTask] A ValueTask to run.
 * @throws {String}
 * @returns {Big} A big.js object.
 */
export const valueTask = async (
  ctx: IJobContext,
  iValueTask: OracleJob.IValueTask
): Promise<Big> => {
  // Convert task to JSON to remove any default values that might come with it.
  const task = OracleJob.ValueTask.create(iValueTask);

  switch (task.Value ?? "") {
    case "value": {
      return new Big(task.value ?? 0);
    }
    case "aggregatorPubkey": {
      const aggregatorAccount = new sbv2.AggregatorAccount(
        ctx.program,
        new PublicKey(task.aggregatorPubkey!)
      );
      const value: Big | null = await aggregatorAccount.fetchLatestValue();
      if (value === null) {
        throw new Error("AggregatorEmptyError");
      }

      return value ?? new Big(0);
    }
    case "big": {
      return new Big(task.big ?? 0);
    }
    default:
      throw new Error("UnexpectedValueTaskError");
  }
};
