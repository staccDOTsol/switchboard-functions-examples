/* eslint-disable */
/* global ethers */
/* eslint prefer-const: "off" */

import { ContractReceipt } from "ethers";
import { ethers } from "hardhat";
import { DiamondCutFacet } from "../typechain-types";
import { getSelectors, FacetCutAction } from "./diamond";

export async function deployDiamond() {
  const fees = await ethers.provider.getFeeData();
  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];
  const deployer = contractOwner;
  console.log("Account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  let switchboardAddress =
    process.env.SWITCHBOARD_ADDRESS ?? process.env.DIAMOND_ADDRESS ?? "";

  let diamondAddress = process.env.SWITCHBOARD_PUSH_ADDRESS ?? "";

  if (!switchboardAddress) {
    throw new Error(
      "Please run export SWITCHBOARD_ADDRESS=<0xSwitchboardDiamondAddress> with the correct Switchboard Address."
    );
  }

  let defaultCutAction = FacetCutAction.Replace;

  if (diamondAddress.length === 0) {
    console.log("INITIALIZING NEW SWITCHBOARD PUSH CONTRACT");
    defaultCutAction = FacetCutAction.Add;
    // deploy DiamondCutFacet
    const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
    const diamondCutFacet = await DiamondCutFacet.deploy({
      gasPrice: fees.gasPrice.mul(1),
    });
    await diamondCutFacet.deployed();
    console.log("DiamondCutFacet deployed:", diamondCutFacet.address);

    // deploy Diamond
    const Diamond = await ethers.getContractFactory("Diamond");
    const diamond = await Diamond.deploy(
      contractOwner.address,
      diamondCutFacet.address,
      { gasPrice: fees.gasPrice.mul(1) }
    );
    await diamond.deployed();
    console.log(
      `Diamond deployed, please run \nexport SWITCHBOARD_PUSH_ADDRESS=${diamond.address}`
    );
    diamondAddress = diamond.address;
  } else {
    console.log(`UPGRADING DIAMOND: ${diamondAddress}`);
  }

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await ethers.getContractFactory("DiamondInit");
  const diamondInit = await DiamondInit.deploy({
    gasPrice: fees.gasPrice.mul(1),
  });
  await diamondInit.deployed();
  console.log("DiamondInit deployed:", diamondInit.address);

  // deploy facets
  console.log("");
  console.log("Deploying facets");
  const FacetNames = [
    ["DiamondLoupeFacet", defaultCutAction],
    ["OwnershipFacet", defaultCutAction],
    ["Admin", defaultCutAction],
    ["Receiver", defaultCutAction],
  ];
  const cut = [];
  for (const [facetName, modifyMode] of FacetNames) {
    const Facet = await ethers.getContractFactory(facetName as string);
    const facet = await Facet.deploy({ gasPrice: fees.gasPrice.mul(1) });
    await facet.deployed();
    console.log(`${facetName} deployed: ${facet.address}`);
    cut.push({
      facetAddress: facet.address,
      action: modifyMode,
      functionSelectors: getSelectors(facet),
    });
  }

  // upgrade diamond with facets
  console.log("");
  console.log("Diamond Cut:", cut);
  const diamondCut = (await ethers.getContractAt(
    "IDiamondCut",
    diamondAddress
  )) as DiamondCutFacet;
  let tx;
  let receipt: ContractReceipt;
  // call to init function
  let functionCall = diamondInit.interface.encodeFunctionData("init");
  tx = await diamondCut.diamondCut(cut, diamondInit.address, functionCall, {
    gasPrice: fees.gasPrice.mul(1),
  });
  console.log("Diamond cut tx: ", tx.hash);
  receipt = await tx.wait();

  const sb = await ethers.getContractAt("Admin", diamondAddress);

  try {
    const switchboard = await sb.deployed();
    const isInitialized = await switchboard.isAdmin(contractOwner.address);
    if (!isInitialized) {
      const tx = await switchboard.initialize(switchboardAddress, {
        gasPrice: fees.gasPrice.mul(1),
      });
      await tx.wait();
      console.log("Initialized Admin", contractOwner.address);
    } else {
      console.log("Already initialized");
    }
  } catch (e) {
    console.log(e);
  }

  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }

  console.log("Completed diamond cut");
  console.log(`export SWITCHBOARD_PUSH_ADDRESS=${diamondAddress}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamond()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployDiamond = deployDiamond;
