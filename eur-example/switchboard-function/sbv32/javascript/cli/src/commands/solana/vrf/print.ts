import { SolanaWithoutSignerBaseCommand as BaseCommand } from "../../../solana";

import { Args } from "@oclif/core";
import { VrfAccount } from "@switchboard-xyz/solana.js";

export default class VrfPrint extends BaseCommand {
  static enableJsonFlag = true;

  static description = "print a VRF and it's associated accounts";

  static flags = {
    ...BaseCommand.flags,
  };

  static args = {
    vrfKey: Args.string({
      description: "public key of the VRF account",
      required: true,
    }),
  };

  async run() {
    const { args, flags } = await this.parse(VrfPrint);

    const [vrfAccount, vrf] = await VrfAccount.load(this.program, args.vrfKey);

    const accounts = await vrfAccount.fetchAccounts(vrf);

    if (flags.json) {
      return accounts;
    }

    this.prettyPrintVrfAccounts(accounts);
  }

  async catch(error: any) {
    super.catch(error, "failed to print vrf");
  }
}
