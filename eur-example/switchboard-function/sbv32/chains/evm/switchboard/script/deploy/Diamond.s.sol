// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* Authors: Timo Neumann <timo@fyde.fi>, Rohan Sundar <rohan@fyde.fi>
* EIP-2535 Diamonds: https://eips.ethereum.org/EIPS/eip-2535

* Script to deploy template diamond with Cut, Loupe and Ownership facet
/******************************************************************************/

import "forge-std/Script.sol";
import "../../src/eip2535/Diamond.sol";
import "../../src/eip2535/facets/DiamondCutFacet.sol";
import "../../src/eip2535/interfaces/IDiamond.sol";
import "../../src/eip2535/facets/DiamondLoupeFacet.sol";
import "../../src/eip2535/facets/OwnershipFacet.sol";
import "../../src/eip2535/upgrade/DiamondInit.sol";
import "../../test/HelperContract.sol";
import "../../src/Switchboard.sol";
import "../../src/sbFunction/SbFunctionMeasurement.sol";
import "../../src/sbFunction/SbFunctionView.sol";
import "../../src/sbFunction/SbFunction.sol";
import "../../src/request/Request.sol";
import "../../src/routine/Routine.sol";
import "../../src/functionSettings/FunctionSettings.sol";
import "../../src/staking/Staking.sol";
import "../../src/enclave/Enclave.sol";
import "../../src/permission/Permission.sol";
import "../../src/attestationQueue/AttestationQueue.sol";
// import "../../src/oracleQueue/OracleQueue.sol";
// import "../../src/oracle/Oracle.sol";
// import "../../src/aggregator/Aggregator.sol";
import "../../src/admin/Admin.sol";
import "../../src/admin/AdminLib.sol";

contract DeployScript is Script, HelperContract {
    // Define the struct
    struct FacetItem {
        string facet;
        FacetCutAction action;
        address _address;
    }

    // Create an array of the struct type
    FacetItem[] public facets;

    constructor() {
        facets.push(
            FacetItem(
                "DiamondLoupeFacet",
                FacetCutAction.Add,
                address(new DiamondLoupeFacet())
            )
        );
        facets.push(
            FacetItem(
                "OwnershipFacet",
                FacetCutAction.Add,
                address(new OwnershipFacet())
            )
        );
        facets.push(
            FacetItem("Admin", FacetCutAction.Add, address(new Admin()))
        );
        // facets.push(
            // FacetItem(
                // "Aggregator",
                // FacetCutAction.Add,
                // address(new Aggregator())
            // )
        // );
        // facets.push(
            // FacetItem("Oracle", FacetCutAction.Add, address(new Oracle()))
        // );
        // facets.push(
            // FacetItem(
                // "OracleQueue",
                // FacetCutAction.Add,
                // address(new OracleQueue())
            // )
        // );
        facets.push(
            FacetItem(
                "AttestationQueue",
                FacetCutAction.Add,
                address(new AttestationQueue())
            )
        );
        facets.push(
            FacetItem(
                "Permission",
                FacetCutAction.Add,
                address(new Permission())
            )
        );
        facets.push(
            FacetItem("Enclave", FacetCutAction.Add, address(new Enclave()))
        );
        // facets.push(
            // FacetItem(
                // "FunctionCall",
                // FacetCutAction.Add,
                // address(new FunctionCall())
            // )
        // );
        facets.push(
            FacetItem(
                "SbFunction",
                FacetCutAction.Add,
                address(new SbFunction())
            )
        );
        facets.push(
            FacetItem(
                "SbFunctionView",
                FacetCutAction.Add,
                address(new SbFunctionView())
            )
        );
        facets.push(
            FacetItem(
                "SbFunctionMeasurement",
                FacetCutAction.Add,
                address(new SbFunctionMeasurement())
            )
        );
        // facets.push(
            // FacetItem(
                // "functionVerify",
                // FacetCutAction.Add,
                // address(new FunctionVerify())
            // )
        // );
        // facets.push(
            // FacetItem(
                // "callVerify",
                // FacetCutAction.Add,
                // address(new CallVerify())
            // )
        // );
        facets.push(
            FacetItem(
                "Request",
                FacetCutAction.Add,
                address(new Request())
            )
        );
        facets.push(
            FacetItem(
                "Routine",
                FacetCutAction.Add,
                address(new Routine())
            )
        );
        facets.push(
            FacetItem(
                "Staking",
                FacetCutAction.Add,
                address(new Staking())
            )
        );
        facets.push(
            FacetItem(
                "FunctionSettings",
                FacetCutAction.Add,
                address(new FunctionSettings())
            )
        );
    }

    function run() external {
        console.log("running deploy script");

        //read env variables and choose EOA for transaction signing
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // deploy DiamondCutFacet
        // Create the first facet
        DiamondCutFacet dCutF = new DiamondCutFacet();

        // deploy Diamond
        // Add the facet to a new diamond
        Switchboard switchboard = new Switchboard(msg.sender, address(dCutF));

        // deploy DiamondInit
        // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
        // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
        DiamondInit diamondInit = new DiamondInit();
        diamondInit.init();

        // deploy our facets
        // FacetCut array which contains the facets to be added
        FacetCut[] memory cut = new FacetCut[](facets.length);
        for (uint i = 0; i < facets.length; i++) {
            FacetItem memory currentFacet = facets[i];

            cut[i] = FacetCut({
                facetAddress: currentFacet._address,
                action: currentFacet.action,
                functionSelectors: generateSelectors(currentFacet.facet)
            });
        }

        // upgrade diamond with facets

        if (!AdminLib.isInitialized()) {
            console.log("initializing the admin facet");
            Admin admin = new Admin();
            admin.initialize();
        } else {
            console.log("admin facet was already initialized");
        }

        vm.stopBroadcast();
    }

    // function isFacet(
    //     FacetItem memory facet,
    //     string memory facetName
    // ) private returns (bool) {
    //     return
    //         keccak256(abi.encodePacked(facet.facet)) ==
    //         keccak256(abi.encodePacked(facetName));
    // }

    // function getFacetAddress(FacetItem memory facet) public returns (address) {
    //     if (isFacet(facet, "DiamondLoupeFacet")) {
    //         return address(new DiamondLoupeFacet());
    //     } else if (isFacet(facet, "")) {
    //         return address(new OwnershipFacet());
    //     }
    // }
}
