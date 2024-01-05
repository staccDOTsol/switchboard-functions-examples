//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {CallVerifyLib} from "../callVerify/CallVerifyLib.sol";
import {FunctionLib} from "../sbFunction/FunctionLib.sol";

library RequestLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.requestv2.storage");

    // Add time requested and time executed
    struct Request {
        address functionId;
        address authority;
        uint256 createdAt;
        bytes requestData;
        bool executed;
        uint256 consecutiveFailures;
        uint256 balance;
        uint256 startAfter;
        uint8 errorCode;
        uint256 executedAt;
        FunctionLib.FunctionStatus status;
    }

    struct DiamondStorage {
        mapping(address => Request) requests;
        address[] requestIds; // list of all function request addresses
    }

    function diamondStorage()
        internal
        pure
        returns (DiamondStorage storage ds)
    {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    function requests(
        address requestId
    ) internal view returns (Request storage) {
        return diamondStorage().requests[requestId];
    }

    function requestExists(address requestId) internal view returns (bool) {
        return diamondStorage().requests[requestId].functionId != address(0);
    }

    function setRequest(
        address functionRequestId,
        address functionId,
        address authority,
        bytes memory requestData,
        uint256 feePaid,
        uint256 startAfter
    ) internal {
        // register params for requestback verification
        CallVerifyLib.registerCallParams(functionRequestId, requestData);
        diamondStorage().requests[functionRequestId] = Request({
            functionId: functionId,
            authority: authority,
            createdAt: block.timestamp,
            requestData: requestData,
            executed: false,
            consecutiveFailures: 0,
            balance: feePaid,
            startAfter: startAfter,
            errorCode: 0,
            executedAt: 0,
            status: FunctionLib.FunctionStatus.NONE
        });
    }

    function pushRequestId(address requestId) internal {
        diamondStorage().requestIds.push(requestId);
    }

    function setExecuted(address requestId) internal {
        diamondStorage().requests[requestId].executed = true;
        diamondStorage().requests[requestId].executedAt = block.timestamp;
    }

    function setStatus(
        address requestId,
        FunctionLib.FunctionStatus status
    ) internal {
        diamondStorage().requests[requestId].status = status;
    }

    function incrementConsecutiveFailures(address requestId) internal {
        diamondStorage().requests[requestId].consecutiveFailures++;
    }
}
