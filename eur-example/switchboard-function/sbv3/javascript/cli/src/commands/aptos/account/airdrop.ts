import { AptosWithoutSignerBaseCommand as BaseCommand } from "../../../aptos";

import { Flags } from "@oclif/core";
import { HexString } from "aptos";

export default class AccountAirdrop extends BaseCommand {
  static enableJsonFlag = true;

  static description = "request an airdrop";

  static flags = {
    ...BaseCommand.flags,
    amount: Flags.integer({
      char: "n",
      description: "number of airdrops to request, 10_000 coins each",
      default: 1_000_000,
    }),
    address: Flags.string({
      description: "HexString address of account to fund",
      required: true,
    }),
  };

  async run() {
    const { flags, args } = await this.parse(AccountAirdrop);

    // const sigs: string[] = await this.faucet.fundAccount(
    //   HexString.ensure(flags.address),
    //   flags.amount
    // );

    // if (flags.json) {
    //   return {
    //     signatures: sigs,
    //     urls: sigs.map((sig) => this.toUrl(sig)),
    //   };
    // }

    // this.logger.info(
    //   JSON.stringify(
    //     {
    //       signatures: sigs,
    //       urls: sigs.map((sig) => this.toUrl(sig)),
    //     },
    //     this.jsonReplacers,
    //     2
    //   )
    // );
  }

  async catch(error: any) {
    super.catch(error, "Failed to request an airdrop");
  }
}
