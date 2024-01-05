import { SolanaWithoutSignerBaseCommand as BaseCommand } from "../../../solana";

import { Args } from "@oclif/core";
import { PublicKey } from "@solana/web3.js";
import { PermissionAccount } from "@switchboard-xyz/solana.js";

export default class PermissionPrint extends BaseCommand {
  static enableJsonFlag = true;

  static description = "print a permission account";

  static flags = {
    ...BaseCommand.flags,
  };

  static args = {
    permissionKey: Args.string({
      description: "public key of the permission account",
      required: true,
    }),
  };

  async run() {
    const { args, flags } = await this.parse(PermissionPrint);

    const permissionAccount = new PermissionAccount(
      this.program,
      new PublicKey(args.permissionKey)
    );
    const permission = await permissionAccount.loadData();

    if (flags.json) {
      return this.normalizeAccountData(permissionAccount.publicKey, {
        ...permission.toJSON(),
      });
    }

    this.prettyPrintPermissions(permission, permissionAccount.publicKey);
  }

  async catch(error: any) {
    super.catch(error, "failed to print permission account");
  }
}
