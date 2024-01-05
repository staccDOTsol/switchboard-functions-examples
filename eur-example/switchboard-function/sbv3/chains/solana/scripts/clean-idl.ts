import type * as anchor from "@coral-xyz/anchor";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

async function main() {
  const idlPath = path.join(__dirname, "target", "idl", "switchboard_v2.json");
  if (!fs.existsSync(idlPath)) {
    execSync(`anchor build`);
  }
  const idl: anchor.Idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  fs.writeFileSync(
    idlPath,
    JSON.stringify(
      idl,
      (key, value) => {
        const ignoreKeys = [
          "docs",
          "bufferRelayerInit",
          "vaultTransfer",
          "programConfig",
          "TaskSpecRecord",
          "RealmSpawnRecordAccountData",
          "AggregatorLockParams",
          "AggregatorSetAuthorityParams",
          "AggregatorSetAuthorityParams",
          "AggregatorSetQueueParams",
          "LeaseSetAuthorityParams",
          "PermissionInitParams",
          "VrfLiteCloseParams",
          "VrfPoolAddParams",
          "VrfPoolRemoveParams",
          "CompletedPointZC",
          "ProjectivePointZC",
          "EcvrfIntermediate",
          "Lanes",
          "Shuffle",
        ];
        if (
          ignoreKeys.includes(key)
          //   ||
          //   (key === "name" && ignoreKeys.includes(value))
        ) {
          return undefined;
        }
        return value;
      },
      2
    )
  );
}

main().catch((error) => console.error(error));
