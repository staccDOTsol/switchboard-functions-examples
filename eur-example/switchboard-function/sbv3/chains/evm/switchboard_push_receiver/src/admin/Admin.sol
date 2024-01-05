//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {AdminLib} from "./AdminLib.sol";
import {Recipient} from "../util/Recipient.sol";
import {ErrorLib} from "../error/ErrorLib.sol";
import {LibDiamond} from "../eip2535/libraries/LibDiamond.sol";

contract Admin is Recipient {
    // Initialization
    function initialize(address _switchboard) external {
        if (AdminLib.isInitialized()) {
            revert ErrorLib.ACLAdminAlreadyInitialized();
        }
        LibDiamond.enforceIsContractOwner();
        AdminLib.setAdmin(msg.sender, true);
        AdminLib.setInitialized();

        // Set switchboard contract address and function id
        AdminLib.setSwitchboard(_switchboard);
        // AdminLib.setFunctionId(_functionId);
    }

    // Switchboard Global State Configuration

    function switchboard() external view returns (address) {
        return AdminLib.switchboard();
    }

    function functionId() external view returns (address) {
        return AdminLib.functionId();
    }

    function setSwitchboard(address _switchboard) external {
        if (!AdminLib.isAdmin(msg.sender)) {
            revert ErrorLib.ACLNotAdmin(msg.sender);
        }
        AdminLib.setSwitchboard(_switchboard);
    }

    function setFunctionId(address _functionId) external {
        if (!AdminLib.isAdmin(msg.sender)) {
            revert ErrorLib.ACLNotAdmin(msg.sender);
        }
        AdminLib.setFunctionId(_functionId);
    }

    // Access Control Getters/Setters

    function setAdmin(address sender, bool status) external {
        LibDiamond.enforceIsContractOwner();
        AdminLib.setAdmin(sender, status);
    }

    function setAllowed(address sender, bool status) external {
        if (!AdminLib.isAdmin(msg.sender)) {
            revert ErrorLib.ACLNotAdmin(msg.sender);
        }
        AdminLib.setAllowed(sender, status);
    }

    function isAdmin(address sender) external view returns (bool) {
        return AdminLib.isAdmin(sender);
    }

    function isAllowed(address sender) external view returns (bool) {
        return AdminLib.isAllowed(sender);
    }
}
