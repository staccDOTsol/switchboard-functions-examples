import { NodeLogger } from "@switchboard-xyz/node/logging";
import { createHash, randomBytes } from "crypto";
import * as fs from "fs";

export class Sgx {
  static generateQuote(userData: { pubkey: Buffer }): Buffer {
    try {
      fs.accessSync("/dev/attestation/quote");
    } catch (err) {
      throw new Error("SgxFileDescriptorsMissingError");
    }
    const hash = createHash("sha256");
    hash.update(userData.pubkey);
    const data = Array.from(hash.digest());
    data.length = 64;
    fs.writeFileSync("/dev/attestation/user_report_data", Buffer.from(data));
    const reportRaw = fs.readFileSync("/dev/attestation/quote");
    NodeLogger.getInstance().info(
      `MR ENCLAVE: ${reportRaw.slice(432, 432 + 32).toString("base64")}`
    );
    return reportRaw;
  }

  // Note that crypto.randomBytes() uses the getrandom syscall under the hood on Linux systems, so you don't need to worry about calling it directly.
  // TODO: verify above
  static readSgxRandomness(len: number): Buffer {
    return randomBytes(len);
  }

  static isInEnclave(): boolean {
    try {
      fs.accessSync("/dev/attestation/quote");
      return true;
    } catch {}
    return false;
  }
}
