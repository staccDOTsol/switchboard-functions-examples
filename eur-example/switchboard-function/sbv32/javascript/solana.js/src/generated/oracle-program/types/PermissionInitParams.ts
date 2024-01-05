import { SwitchboardProgram } from "../../../SwitchboardProgram.js";
import * as types from "../types/index.js"; // eslint-disable-line @typescript-eslint/no-unused-vars

import * as borsh from "@coral-xyz/borsh";
import { PublicKey } from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { BN } from "@switchboard-xyz/common"; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface PermissionInitParamsFields {}

export interface PermissionInitParamsJSON {}

export class PermissionInitParams {
  constructor(fields: PermissionInitParamsFields) {}

  static layout(property?: string) {
    return borsh.struct([], property);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new PermissionInitParams({});
  }

  static toEncodable(fields: PermissionInitParamsFields) {
    return {};
  }

  toJSON(): PermissionInitParamsJSON {
    return {};
  }

  static fromJSON(obj: PermissionInitParamsJSON): PermissionInitParams {
    return new PermissionInitParams({});
  }

  toEncodable() {
    return PermissionInitParams.toEncodable(this);
  }
}
