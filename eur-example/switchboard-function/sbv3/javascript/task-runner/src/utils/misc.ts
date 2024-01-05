import { Big, BN } from "@switchboard-xyz/common";

/** Returns whether the NODE_ENV flag is set to production */
export function isProduction(): boolean {
  return process.env.NODE_ENV && process.env.NODE_ENV === "production"
    ? true
    : false;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function verboseLogger(logString: string, ...labels: string[]) {
  if (process.env.VERBOSE) {
    if (labels) {
      const combinedLabels = labels.map((l) => `[${l}]`).join(" ");
      console.log(
        "\x1b[33m[VERBOSE]: \x1b[0m\x1b[35m%s\x1b[0m\x1b[34m%s\x1b[0m",
        `${combinedLabels}: `,
        logString
      );
    } else {
      console.log("[VERBOSE]: \x1b[34m%s\x1b[0m", logString);
    }
  }
}

export function toString(value: any): string {
  if (value !== null && value !== undefined) {
    if (typeof value === "function") {
      throw new Error(`Cannot convert function to string`);
    }
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof Big) {
      return value.toString();
    }
    if (value instanceof BN) {
      return value.toString(10);
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    if (typeof value === "number") {
      return value.toString();
    }
    if (typeof value === "bigint") {
      return value.toString(0);
    }

    if ("toString" in value && typeof value.toString === "function") {
      return value.toString();
    }

    return value;
  }

  return "";
}
