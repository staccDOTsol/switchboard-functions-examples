//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {AdminLib} from "../admin/AdminLib.sol";
import {ErrorLib} from "../error/ErrorLib.sol";

// Simplest interface for calling Switchboard Functions
interface ISwitchboard {
    function callFunction(
        address functionId,
        bytes memory params
    ) external payable returns (address callId);
}

// Inherited by all contracts that are recipients of switchboard callbacks
contract Recipient {
    function callSwitchboardFunction(
        address functionId,
        bytes memory params // arbitrary user-defined parameters handled function-side
    ) internal returns (address callId) {
        callId = ISwitchboard(AdminLib.switchboard()).callFunction{
            value: msg.value
        }(functionId, params);
    }

    // get forwarded sender if trusted forwarder is used
    function getMsgSender() internal view returns (address payable signer) {
        signer = payable(msg.sender);
        if (msg.data.length >= 20 && signer == AdminLib.switchboard()) {
            assembly {
                signer := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        }
        return signer;
    }

    // check that switchboard is the forwarder
    // check that the correct functionId is sending the data
    function verifySwitchboardFunction() internal view {
        address signer = payable(msg.sender);

        // require that the forwarder be switchboard
        if (msg.data.length >= 20 && signer == AdminLib.switchboard()) {
            assembly {
                signer := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        }

        if (signer != AdminLib.functionId()) {
            revert ErrorLib.InvalidSender(AdminLib.functionId(), signer);
        }
    }
}
