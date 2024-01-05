import { ethers } from "hardhat";

async function main() {
  const contract = await ethers.deployContract("ReceiverExample", [
    "0x77409146b4d38c230c83ce7f971094b036192973", // switchboard address,
  ]);
  await contract.deployed();
  console.log("ReceiverExample deployed to:", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
