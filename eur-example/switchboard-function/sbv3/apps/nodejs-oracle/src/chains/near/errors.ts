import { SwitchboardPermission } from "@switchboard-xyz/near.js";

export class NearError extends Error {
  constructor(public code: NearErrorCode, message: string) {
    super(`${NearErrorCode[code]}: ${message}`);
    Object.setPrototypeOf(this, NearError.prototype);
  }
}

export enum NearErrorCode {
  "Unknown" = 0,
  "NearEnvironmentError" = 1,
  "InsufficientOraclePermissions" = 2,
  "LowPayerBalance" = 3,
}

export class NearEnvironmentError extends NearError {
  constructor(message: string) {
    super(NearErrorCode.NearEnvironmentError, message);
    Object.setPrototypeOf(this, NearEnvironmentError.prototype);
  }
}

export class NearPermissionError extends NearError {
  constructor(permissions: number) {
    super(
      NearErrorCode.InsufficientOraclePermissions,
      `Oracle does not have PERMIT_ORACLE_HEARTBEAT_PERMISSIONS, current permission: ${SwitchboardPermission[permissions]}`
    );
    Object.setPrototypeOf(this, NearPermissionError.prototype);
  }
}

export class NearLowPayerBalanceError extends NearError {
  constructor(balance: string) {
    super(
      NearErrorCode.LowPayerBalance,
      `Oracle payer only has ${balance} tokens`
    );
    Object.setPrototypeOf(this, NearLowPayerBalanceError.prototype);
  }
}
