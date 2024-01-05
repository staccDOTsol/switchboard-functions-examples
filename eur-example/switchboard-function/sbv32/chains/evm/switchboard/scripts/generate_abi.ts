/* global ethers */
/* eslint prefer-const: "off" */
import { exec, execSync } from "child_process";
import * as fs from "fs";
import { ethers } from "hardhat";

async function main() {
  // get artifacts json from artifacts/hardhat-diamond-abi/HardhatDiamondABI.sol/Switchboard.json with dupes
  const artifactsABI: Record<string, any> = JSON.parse(
    fs.readFileSync(
      "./artifacts/hardhat-diamond-abi/HardhatDiamondABI.sol/Switchboard.json",
      "utf8"
    )
  );

  // remove duplicates and make new abi
  const seenNames = new Set();
  const abi = {
    _format: artifactsABI._format,
    contractName: artifactsABI.contractName,
    sourceName: artifactsABI.sourceName, //@ts-ignore
    abi: artifactsABI.abi.filter(
      (item: any) => !seenNames.has(item.name) && seenNames.add(item.name)
    ),
    bytecode: artifactsABI.bytecode,
    deployedBytecode: artifactsABI.deployedBytecode,
    linkReferences: {},
    deployedLinkReferences: {},
  };

  // write file to /abis/Switchboard.json
  fs.writeFileSync(
    "./abis/Switchboard.json", // @ts-ignore
    JSON.stringify(abi, null, 2)
  );

  // run `cargo run` from ./rust/old-bindings/
  // this will generate the rust bindings
  execSync("cargo run", {
    cwd: "./rust/old-bindings/",
  });
  console.log("Current directory: " + execSync("pwd").toString());

  execSync(
    "cp ./rust/old-bindings/bindings/switchboard.rs ../../../apps/function-manager/lib/evm/src/sdk/switchboard.rs"
  );

  execSync(
    "cp ./rust/old-bindings/bindings/switchboard.rs ../../../apps/quote-verification-oracle/lib/evm/src/sdk/switchboard.rs"
  );

  execSync(
    "cp ./rust/old-bindings/bindings/switchboard.rs ../../../rust/switchboard-evm/src/bindings/switchboard.rs"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
