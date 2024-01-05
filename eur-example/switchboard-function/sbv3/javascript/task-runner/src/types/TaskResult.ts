import { Big } from "@switchboard-xyz/common";

export type ITaskResult = Big | string;

/** The output of a TaskExecution */
export class TaskResult {
  constructor(readonly _value?: ITaskResult | undefined) {}

  new(): TaskResult {
    return new TaskResult(this._value);
  }

  get value(): ITaskResult {
    return this._value ?? "";
  }

  toString(): string {
    if (this.value === undefined) {
      return "";
    }
    if (typeof this.value === "string") {
      return this.value;
    }
    const oldDP = Big.DP;
    Big.DP = 20;
    const oldRM = Big.RM;
    Big.RM = 1;
    const cacheValue = this.value.toString();
    Big.DP = oldDP;
    Big.RM = oldRM;
    return cacheValue;
  }

  get big(): Big {
    if (this.value === undefined) {
      throw new Error(`TaskResult is undefined, cannot convert to Big.js`);
    }
    if (typeof this.value === "string") {
      // remove leading and trailing single or double quotes
      // workerpool has a tendency to add these when sending across shared memory
      const valueStr = this.value.replace(/^["'](.+(?=["']$))["']$/, "$1");
      return new Big(valueStr);
    }
    return this.value;
  }

  get buffer(): Buffer {
    if (this._value === undefined) {
      return Buffer.from("");
    }
    if (typeof this._value === "string") {
      return Buffer.from(this._value);
    }
    return Buffer.from(this._value.toString());
  }
}
