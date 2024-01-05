import type {
  OracleAccount,
  OracleSaveResultParams,
} from "@switchboard-xyz/aptos.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type { AptosAccount } from "aptos";

interface ICachedAction {
  name: string;
  action: OracleSaveResultParams;
  callback: (name: string, signature: string) => Promise<void>;
  onFailure: (name: string, signature: string) => Promise<void>;
}

export class BatchSaveResult extends SwitchboardRoutine {
  eventName = "BatchSaveResult";

  errorHandler = async (error) => {
    NodeLogger.getInstance().error(`Failed to batch save result, ${error}`);
  };
  successHandler = undefined;
  retryInterval = 0;

  actions: Map<string, ICachedAction> = new Map();

  lastHeartbeat: number;

  constructor(
    readonly account: AptosAccount,
    readonly oracle: OracleAccount,
    readonly heartbeatInterval: number,
    lastHeartbeat = 0
  ) {
    super(4000); // 4 seconds
    this.lastHeartbeat = lastHeartbeat;
  }

  send(
    address: string,
    action: OracleSaveResultParams,
    callback: (name: string, signature: string) => Promise<void>,
    onFailure: (name: string, signature: string) => Promise<void>
  ) {
    this.actions.set(address, { action, name: address, callback, onFailure });
  }

  routine = async () => {
    const unixTimestamp = Math.floor(Date.now() / 1000);
    if (this.actions.size === 0) {
      if (unixTimestamp > this.lastHeartbeat + this.heartbeatInterval) {
        const sig = await this.oracle.heartbeat(this.account);
        NodeLogger.getInstance().debug(`Heartbeat Signature: ${sig}`);
        this.lastHeartbeat = unixTimestamp;
      }
      return;
    }

    const readyFeeds = [...this.actions];
    const readyActions = readyFeeds.map((f) => f[1].action);
    // this.queue = [];

    // send all save results from the last 4 seconds
    await this.oracle
      .saveManyResult(this.account, readyActions, 1000)
      .then(async (sig) => {
        NodeLogger.getInstance().info(
          `save_result_batch signature ${sig} - for ${readyActions
            .map((v) => v.aggregatorAddress)
            .join(", ")}`,
          "SaveResultBatch"
        );
        this.lastHeartbeat = unixTimestamp;
        await Promise.all(
          readyFeeds.map((f, idx) => {
            this.actions.delete(readyFeeds[idx][0]);
            return f[1].callback(readyFeeds[idx][0], sig);
          })
        );
      })
      .catch(async (error) => {
        NodeLogger.getInstance().error(
          `save_result_batch error - ${error}`,
          "SaveResultBatch"
        );
        await Promise.all(
          readyFeeds.map((f, idx) => {
            this.actions.delete(readyFeeds[idx][0]);
            return f[1].onFailure(readyFeeds[idx][0], error);
          })
        );
      });
  };
}
