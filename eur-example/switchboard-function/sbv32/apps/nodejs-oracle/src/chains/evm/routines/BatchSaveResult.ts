import { NodeEnvironment } from "../../../env/NodeEnvironment";
import { NodeTelemetry } from "../../../modules/telemetry";

import type { OracleAccount, SaveResultParams } from "@switchboard-xyz/evm.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";

interface ICachedAction {
  name: string;
  action: SaveResultParams;
  callback: (name: string, signature: string) => Promise<void>;
  onFailure: (name: string, signature: string) => Promise<void>;
}

// A routine that batches up saveResult calls to the oracle
export class BatchSaveResult extends SwitchboardRoutine {
  eventName = "BatchSaveResult";

  errorHandler = async (error) => {
    NodeLogger.getInstance().error(`Failed to batch save result, ${error}`);
  };
  successHandler = undefined;
  retryInterval = 0;

  actions: Map<string, ICachedAction> = new Map();

  constructor(readonly oracle: OracleAccount) {
    super(15000); // 15 seconds
  }

  send(
    address: string,
    action: SaveResultParams,
    callback: (name: string, signature: string) => Promise<void>,
    onFailure: (name: string, signature: string) => Promise<void>
  ) {
    this.actions.set(address, { action, name: address, callback, onFailure });
  }

  routine = async () => {
    try {
      const readyFeeds = [...this.actions];
      const readyActions = readyFeeds.map((f) => f[1].action);

      // get relevant data about the oracle and queue
      const oracleData = await this.oracle.client.oracles(this.oracle.address);
      let oracleIdx = (
        await this.oracle.client.getOracleIdx(this.oracle.address)
      ).toNumber();

      // heartbeat onto queue if we are not already on it
      if (oracleIdx === -1) {
        const hbTx = await this.oracle.client.heartbeat(this.oracle.address);
        await hbTx.wait();
        oracleIdx = (
          await this.oracle.client.getOracleIdx(this.oracle.address)
        ).toNumber();
      }

      // if we don't have any actions to send, return
      if (readyFeeds.length === 0) {
        return Promise.resolve();
      }

      // send all save results from the last 4 seconds
      await this.oracle
        .saveManyResults({
          data: readyActions,
          oracleIdx,
          queueAddress: oracleData.queueAddress,
        })
        .then(async (tx) => {
          NodeLogger.getInstance().info(
            `save_result_batch signature ${tx.hash} - for ${readyActions
              .map((v) => v.aggregatorAddress)
              .join(", ")}`,
            "SaveResultBatch"
          );
          await tx.wait();
          await Promise.all(
            readyFeeds.map((f, idx) => {
              this.actions.delete(readyFeeds[idx][0]);
              return f[1].callback(readyFeeds[idx][0], tx.hash);
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
    } catch (e) {
      NodeLogger.getInstance().error(
        `save_result_batch error - ${e}`,
        "SaveResultBatch"
      );
    }
    if (!NodeEnvironment.getInstance().LOCALNET) {
      setTimeout(async () => {
        NodeTelemetry.getInstance().sendVersionMetric(
          NodeEnvironment.getInstance().CHAIN,
          NodeEnvironment.getInstance().NETWORK_ID,
          await this.oracle.client
            .oracles(this.oracle.address)
            .then((data) => data.queueAddress)
            .catch(() => ""),
          this.oracle.address
        );
      });
    }
  };
}
