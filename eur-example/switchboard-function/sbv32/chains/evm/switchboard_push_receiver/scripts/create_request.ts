import {
  AttestationQueueAccount,
  FunctionAccount,
  SwitchboardProgram,
} from "@switchboard-xyz/evm.js";
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const diamondAddress =
    process.env.SWITCHBOARD_ADDRESS ?? process.env.DIAMOND_ADDRESS ?? "";

  const schedule = process.env.SCHEDULE;
  const ethValue = process.env.ETH_VALUE ?? "0.1";
  const params = process.env.PARAMS ?? "";
  const functionId = process.env.FUNCTION_ID ?? "";

  const routineId = ethers.Wallet.createRandom().address;

  if (!diamondAddress) {
    throw new Error(
      "Please set the diamond address with: export SWITCHBOARD_ADDRESS=..."
    );
  }

  if (!functionId) {
    throw new Error("Please set the function id with: export FUNCTION_ID=...");
  }

  if (!schedule) {
    throw new Error(
      'Please set the schedule, ex: export SCHEDULE="* * * * * *"'
    );
  }

  if (!params) {
    console.warn("No params set, using empty string");
  }

  console.log("Account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const switchboardProgram = await SwitchboardProgram.load(
    deployer,
    diamondAddress
  );

  const request = await switchboardProgram.sb.sendRequest(functionId, [], {
    value: ethers.utils.parseEther(ethValue),
  });

  console.log(functionId);
  console.log(deployer.address!);
  console.log(schedule);
  console.log(params);
  console.log(ethValue);

  const tx = await request.wait();
  console.log(`Successfully ran tx: `, tx);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
