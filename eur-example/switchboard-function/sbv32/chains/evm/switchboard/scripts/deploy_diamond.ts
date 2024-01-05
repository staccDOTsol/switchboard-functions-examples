/* global ethers */
/* eslint prefer-const: "off" */

import type { DiamondCutFacet } from "../typechain-types";

import { FacetCutAction, getSelectors } from "./diamond";

import { SwitchboardProgram } from "@switchboard-xyz/evm.js";
import type { ContractReceipt } from "ethers";
import { ethers } from "hardhat";

function anySelectorDeployed(facets: any[], selectors: any[]): boolean {
  for (const facet of facets) {
    const facetSelectors = new Set(facet.functionSelectors);
    for (const element of selectors) {
      if (facetSelectors.has(element)) {
        return true;
      }
    }
  }
  return false;
}

export async function deployDiamond() {
  const fees = await ethers.provider.getFeeData();
  console.log("Fees:", fees);
  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];

  console.log(accounts);
  const deployer = contractOwner;
  console.log("Account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());
  let diamondAddress = process.env.DIAMOND_ADDRESS ?? "";
  let defaultCutAction = FacetCutAction.Replace;

  if (diamondAddress.length === 0) {
    console.log("INITIALIZING NEW CONTRACT");
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
      `Diamond deployed, please run export DIAMOND_ADDRESS=${diamond.address}`
    );
    diamondAddress = diamond.address;
  } else {
    console.log(`UPGRADING DIAMOND: ${diamondAddress}`);
  }
  const switchboardProgram = await SwitchboardProgram.load(
    deployer,
    diamondAddress
  );
  const facets = await switchboardProgram.sb.facets();

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
    ["Aggregator", defaultCutAction],
    ["Oracle", defaultCutAction],
    ["OracleQueue", defaultCutAction],
    ["AttestationQueue", defaultCutAction],
    ["Permission", defaultCutAction],
    ["Enclave", defaultCutAction],
    ["FunctionCall", defaultCutAction],
    ["SbFunction", defaultCutAction],
    ["SbFunctionView", defaultCutAction],
    ["SbFunctionMeasurement", defaultCutAction],
    ["Staking", defaultCutAction],
    // # New modules
    ["FunctionVerify", defaultCutAction],
    ["CallVerify", defaultCutAction],
    ["Request", defaultCutAction],
    ["Routine", defaultCutAction],
    ["FunctionSettings", defaultCutAction],
    ["CallBalance", defaultCutAction],
  ];

  const cut = [];
  for (const [facetName, modifyMode] of FacetNames) {
    const facetFactory = await ethers.getContractFactory(facetName);
    const facet = await facetFactory.deploy({
      gasPrice: fees.gasPrice.mul(1),
    });
    await facet.deployed();
    console.log(`${facetName} deployed: ${facet.address}`);
    let modifyMode = FacetCutAction.Add;
    if (anySelectorDeployed(facets, getSelectors(facet))) {
      modifyMode = FacetCutAction.Replace;
    }
    cut.push({
      facetAddress: facet.address,
      action: modifyMode,
      functionSelectors: getSelectors(facet),
    });
  }

  // upgrade diamond with facets
  // console.log("");
  // console.log("Diamond Cut:", cut);
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
      const tx = await switchboard.initialize({
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
