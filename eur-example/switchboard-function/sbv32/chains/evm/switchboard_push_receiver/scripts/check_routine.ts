import { SwitchboardProgram } from "@switchboard-xyz/evm.js";
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const diamondAddress =
    process.env.SWITCHBOARD_ADDRESS ?? process.env.DIAMOND_ADDRESS ?? "";
  const routineId = process.env.ROUTINE_ID ?? "";

  if (!diamondAddress) {
    throw new Error(
      "Please set the diamond address with: export SWITCHBOARD_ADDRESS=..."
    );
  }

  if (!routineId) {
    throw new Error("Please set the function id with: export FUNCTION_ID=...");
  }

  console.log("Account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());
  const switchboardProgram = await SwitchboardProgram.load(
    deployer,
    diamondAddress
  );

  const r = await switchboardProgram.sb.routines(routineId);
  console.log(r);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
