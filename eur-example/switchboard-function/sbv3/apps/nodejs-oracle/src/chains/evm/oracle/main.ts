import { EVMEnvironment } from "../../../env/EVMEnvironment";
import type { SwitchboardTaskRunner } from "../../../modules/task-runner";
import type { App } from "../../../types";
import { SwitchboardApp } from "../../../types";
import { BatchSaveResult } from "../routines/BatchSaveResult";
import { UpdateSearch } from "../routines/UpdateSearch";

import type { ChainType } from "@switchboard-xyz/common";
import { getSwitchboard, OracleAccount } from "@switchboard-xyz/evm.js";
import type { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import * as ethers from "ethers";

export interface IEVMOracle {
  routines: SwitchboardEventDispatcher[];
  oracle: OracleAccount;
}

export class EVMOracle extends SwitchboardApp implements IEVMOracle {
  // Chain label can be swapped, but this could serve as the default evm implementation
  chain: ChainType = "coredao";
  app: App = "oracle";

  private constructor(
    readonly routines: SwitchboardEventDispatcher[],
    readonly oracle: OracleAccount
  ) {
    super();
  }

  static async load(
    taskRunner: SwitchboardTaskRunner,
    chain?: ChainType
  ): Promise<EVMOracle> {
    chain = chain || "coredao";
    const env = EVMEnvironment.getInstance();
    env.log();
    const client = getSwitchboard(
      env.EVM_CONTRACT_ADDRESS,
      new ethers.Wallet(
        await env.loadAccount(),
        new ethers.providers.JsonRpcProvider(env.EVM_RPC_URL, {
          chainId: parseInt(env.EVM_CHAIN_ID!),
          name: env.CHAIN,
        })
      )
    );

    NodeLogger.getInstance().info(`EVM_PAYER: ${client.address}`);
    const oracle = new OracleAccount(client, env.oracleAddress);
    const sig = await oracle.heartbeat();
    NodeLogger.getInstance().debug(`Heartbeat Signature: ${sig.hash}`);
    const batchRoutine = new BatchSaveResult(oracle);
    const updateSearchRoutine = new UpdateSearch(
      taskRunner,
      oracle,
      batchRoutine
    );
    await updateSearchRoutine.initialize();
    const routines: SwitchboardEventDispatcher[] = [
      updateSearchRoutine,
      batchRoutine,
    ];

    return new EVMOracle(routines, oracle);
  }
}
