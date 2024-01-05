import { AptosWithSignerBaseCommand as BaseCommand } from "../../../aptos";

import { Args, Flags } from "@oclif/core";
import { Permission, SwitchboardPermission } from "@switchboard-xyz/aptos.js";
import { HexString } from "aptos";

export default class PermissionCreate extends BaseCommand {
  static enableJsonFlag = true;

  static description = "create a new permission";

  static flags = {
    ...BaseCommand.flags,
    aggregator: Flags.string({
      exclusive: ["oracle"],
      description:
        "HexString of  the aggregator address to create a permission for",
    }),
    oracle: Flags.string({
      exclusive: ["aggregator"],
      description:
        "HexString of  the aggregator address to create a permission for",
    }),
    enable: Flags.boolean({
      description: "whether to enable the permissions after creation",
    }),
  };

  static args = {
    granter: Args.string({
      description: "HexString of the oracle queue to create a permission for",
      required: true,
    }),
  };

  async run() {
    const { flags, args } = await this.parse(PermissionCreate);

    const [queue, queueData] = await this.loadQueue(args.granter);

    if (
      flags.enable &&
      queueData.authority.toString() !== this.signer.address().toString()
    ) {
      throw new Error(
        `QueueAuthorityMismatch: Expected ${
          queueData.authority
        }, received ${this.signer.address().toString()}`
      );
    }

    const grantee = flags.aggregator ?? flags.oracle ?? undefined;
    if (!grantee) {
      throw new Error(`Failed to find grantee of '--aggregator' or '--oracle'`);
    }

    const [permission, initSig] = await Permission.init(
      this.aptos,
      this.signer,
      {
        authority: queueData.authority,
        granter: queue.address,
        grantee: HexString.ensure(grantee).toString(),
      },
      this.programId.toString()
    );
    this.logger.log(`Permission Init: ${this.toUrl(initSig)}`);

    if (flags.enable) {
      const setSig = await permission.set(this.signer, {
        authority: queueData.authority,
        granter: queue.address,
        grantee: HexString.ensure(grantee).toString(),
        enable: true,
        permission: flags.oracle
          ? SwitchboardPermission.PERMIT_ORACLE_HEARTBEAT
          : SwitchboardPermission.PERMIT_ORACLE_QUEUE_USAGE,
      });
      this.logger.log(`Permission Set: ${this.toUrl(setSig)}`);
    }

    // this.logger.info(`Crank Key: ${crank.address}`);
    // this.logger.info(this.normalizeAccountData(crank.address, crankData));
  }

  async catch(error: any) {
    super.catch(error, "Failed to create aptos permission");
  }
}
