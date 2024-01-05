// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";

import "../src/eip2535/interfaces/IDiamondCut.sol";
import "../src/eip2535/facets/DiamondCutFacet.sol";
import "../src/eip2535/facets/DiamondLoupeFacet.sol";
import "../src/eip2535/facets/OwnershipFacet.sol";
import "../src/eip2535/Diamond.sol";

contract DiamondDeployer is Test, IDiamondCut {
  //contract types of facets to be deployed
  Diamond diamond;
  DiamondCutFacet dCutFacet;
  DiamondLoupeFacet dLoupe;
  OwnershipFacet ownerF;

  function testDeployDiamond() public {
    //deploy facets
    dCutFacet = new DiamondCutFacet();
    diamond = new Diamond(address(this), address(dCutFacet));
    dLoupe = new DiamondLoupeFacet();
    ownerF = new OwnershipFacet();

    //upgrade diamond with facets

    //build cut struct
    FacetCut[] memory cut = new FacetCut[](2);

    cut[0] = (
      FacetCut({
        facetAddress: address(dLoupe),
        action: FacetCutAction.Add,
        functionSelectors: generateSelectors("DiamondLoupeFacet")
      })
    );

    cut[1] = (
      FacetCut({
        facetAddress: address(ownerF),
        action: FacetCutAction.Add,
        functionSelectors: generateSelectors("OwnershipFacet")
      })
    );

    //upgrade diamond
    IDiamondCut(address(diamond)).diamondCut(cut, address(0x0), "");

    //call a function
    DiamondLoupeFacet(address(diamond)).facetAddresses();
  }

  function generateSelectors(
    string memory _facetName
  ) internal returns (bytes4[] memory selectors) {
    string[] memory cmd = new string[](4);
    cmd[0] = "npx";
    cmd[1] = "hardhat";
    cmd[2] = "genSelectors";
    cmd[3] = _facetName;
    bytes memory res = vm.ffi(cmd);
    selectors = abi.decode(res, (bytes4[]));
  }

  function diamondCut(
    FacetCut[] calldata _diamondCut,
    address _init,
    bytes calldata _calldata
  ) external override {}
}
