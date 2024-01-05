import { SolanaBaseCommand } from "./BaseCommand";

import type { Input } from "@oclif/parser";

export abstract class SolanaWithoutSignerBaseCommand extends SolanaBaseCommand {
  static flags = {
    ...SolanaBaseCommand.flags,
  };

  public hasSigner = false;

  async init() {
    await super.init();
    const { flags } = await this.parse((<Input<any>>this.constructor) as any);
    SolanaBaseCommand.flags = flags as any;

    this.program = await this.loadProgram();
  }
}
