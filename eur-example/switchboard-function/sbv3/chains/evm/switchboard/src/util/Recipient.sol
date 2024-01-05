//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {UtilLib} from "./UtilLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {AdminLib} from "../admin/AdminLib.sol";

// EIP2771 Context
// Inherited by all contracts that are recipients of switchboard meta-transactions
contract Recipient {
    enum GuardType {
        NONE,
        FORWARDER,
        PUBLIC,
        ALLOWED,
        ADMIN
    }

    modifier guarded(GuardType code) {
        uint256 startCode = UtilLib.getCode();

        // if code requires greater than public permissions - check if sender is allowed
        if (
            uint256(code) > uint256(GuardType.PUBLIC) &&
            !AdminLib.isAllowed(getMsgSender())
        ) {
            revert ErrorLib.ACLNotAllowed(getMsgSender());
        }

        // if code requires admin permissions - check if sender is admin
        if (
            uint256(code) == uint256(GuardType.ADMIN) &&
            !AdminLib.isAdmin(getMsgSender())
        ) {
            revert ErrorLib.ACLNotAdmin(getMsgSender());
        }

        // if trying to call a forwarder and we're already in a forwarder - revert
        // also in the case we're trying to re-enter as a forwarder (eg shenanigans) revert
        if (code == GuardType.FORWARDER && startCode != 0) {
            revert ErrorLib.InvalidEntry();
        }

        // no reentry unless we're a forwarder
        if (startCode != uint256(GuardType.FORWARDER) && startCode != 0) {
            revert ErrorLib.InvalidEntry();
        }

        // set current code so downstream checks are aware of the previous code
        UtilLib.setCode(uint256(code));

        _;

        // reset the code to the previous value
        UtilLib.setCode(startCode);
    }

    // get forwarded sender if trusted forwarder is used
    function getMsgSender() internal view returns (address payable signer) {
        signer = payable(msg.sender);
        if (msg.data.length >= 20 && signer == address(this)) {
            assembly {
                signer := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        }
    }
}
