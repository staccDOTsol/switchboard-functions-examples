//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {AdminLib} from "./AdminLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {Recipient} from "../util/Recipient.sol";
import {LibDiamond} from "../eip2535/libraries/LibDiamond.sol";

contract Admin is Recipient {
    // can only be called once, and only by contract owner
    function initialize() external {
        if (AdminLib.isInitialized()) {
            revert ErrorLib.ACLAdminAlreadyInitialized();
        }
        LibDiamond.enforceIsContractOwner();
        AdminLib.setAdmin(msg.sender, true);
        AdminLib.setInitialized();
    }

    // can only be called by contract owner
    function setAdmin(address sender, bool status) external {
        LibDiamond.enforceIsContractOwner();
        AdminLib.setAdmin(sender, status);
    }

    function setAllowed(address sender, bool status) external {
        if (!AdminLib.isAdmin(getMsgSender())) {
            revert ErrorLib.ACLNotAdmin(getMsgSender());
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
