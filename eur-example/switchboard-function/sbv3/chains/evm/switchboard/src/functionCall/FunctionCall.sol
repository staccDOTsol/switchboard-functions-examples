//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {FunctionCallLib} from "./FunctionCallLib.sol";
import {FunctionLib} from "../sbFunction/FunctionLib.sol";
import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";
import {EnclaveLib} from "../enclave/EnclaveLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {PermissionLib} from "../permission/PermissionLib.sol";
import {TransactionLib} from "../transaction/TransactionLib.sol";
import {UtilLib} from "../util/UtilLib.sol";

import {Enclave} from "../enclave/Enclave.sol";
import {Recipient} from "../util/Recipient.sol";

contract FunctionCall is Recipient {
    event FunctionCallFund(
        address indexed functionId,
        address indexed funder,
        uint256 indexed amount
    );
    event FunctionCallEvent(
        address indexed functionId,
        address indexed sender,
        address indexed callId,
        bytes params
    );

    function callFunction(
        address functionId,
        bytes memory params
    ) external payable guarded(GuardType.PUBLIC) returns (address callId) {
        address msgSender = getMsgSender();

        if (!FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionDoesNotExist(functionId);
        }

        FunctionLib.SbFunction storage fn = FunctionLib.funcs(functionId);
        FunctionCallLib.FunctionCallSettings memory settings = FunctionCallLib
            .functionCallSettings(functionId);

        if (settings.requireEstimatedRunCostFee) {
            uint256 estimatedRunCost = FunctionLib.estimateRunCost(
                functionId,
                tx.gasprice
            );
            if (msg.value < estimatedRunCost) {
                revert ErrorLib.FunctionFeeTooLow(
                    functionId,
                    estimatedRunCost,
                    msg.value
                );
            }
        }

        if (settings.minimumFee > 0 && msg.value < settings.minimumFee) {
            revert ErrorLib.FunctionFeeTooLow(
                functionId,
                settings.minimumFee,
                msg.value
            );
        }

        // if no permittedCallers are set, then anyone can call
        if (
            fn.config.permittedCallers.length > 0 &&
            !UtilLib.containsAddress(fn.config.permittedCallers, msgSender)
        ) {
            revert ErrorLib.FunctionCallerNotPermitted(functionId, msgSender);
        }

        // handle function call creation
        callId = UtilLib.generateId();
        FunctionCallLib.setFunctionCall(
            callId,
            functionId,
            msgSender,
            params,
            msg.value
        );
        FunctionCallLib.pushFunctionCallId(callId);

        // increment trigger count so function can tell how many calls have been made
        emit FunctionCallEvent(functionId, msgSender, callId, params);

        // add sent funds to the function balance
        FunctionLib.escrowFund(functionId, msg.value);
        emit FunctionCallFund(functionId, msg.sender, msg.value);
    }

    // optional settings relating to function call configuration
    function setFunctionCallSettings(
        address functionId,
        // require fee to be at least estimated run cost - uses recent runs for gas cost estimation
        bool requireEstimatedRunCostFee,
        // minimum fee to be paid - if requireFee is true, this is the minimum fee
        // 0 to disable minimum fee
        uint256 minimumFee,
        // maximum gas that a downstream function call can cost
        // 0 to disable gas cost check
        uint256 maxGasCost,
        // require that a call be paid for by the sender for a call
        // fail calls that don't meet this requirement
        // will be enforced off-chain
        bool requireCallerPayFullCost,
        // if an address(user or contract) is passed in, require that address be the destination of the callback
        // (to prevent fabricating a malicious callback into an existing receiver on an open function)
        // will be enforced off-chain
        bool requireSenderBeReturnAddress
    ) external guarded(GuardType.PUBLIC) {
        if (!FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionDoesNotExist(functionId);
        }

        // check authority
        FunctionLib.SbFunction storage fn = FunctionLib.funcs(functionId);
        if (msg.sender != fn.authority) {
            revert ErrorLib.InvalidAuthority(fn.authority, msg.sender);
        }

        // set function call settings
        FunctionCallLib.setFunctionCallSettings(
            functionId,
            requireEstimatedRunCostFee,
            minimumFee,
            maxGasCost,
            requireCallerPayFullCost,
            requireSenderBeReturnAddress
        );
    }

    // Get the set of calls that need to be addressed with params for a particular function
    function functionCalls(
        address callId
    ) external view returns (FunctionCallLib.FunctionCall memory) {
        FunctionCallLib.DiamondStorage storage fcs = FunctionCallLib
            .diamondStorage();
        FunctionCallLib.FunctionCall memory fnCall = fcs.functionCalls[callId];
        return fnCall;
    }

    function functionCallSettings(
        address functionId
    ) external view returns (FunctionCallLib.FunctionCallSettings memory) {
        FunctionCallLib.DiamondStorage storage fcs = FunctionCallLib
            .diamondStorage();
        FunctionCallLib.FunctionCallSettings memory settings = fcs
            .functionCallSettings[functionId];
        return settings;
    }

    // Get the set of calls that need to be addressed with params for a particular function
    function getActiveFunctionCallsByQueue(
        address queueId
    )
        external
        view
        returns (address[] memory, FunctionCallLib.FunctionCall[] memory)
    {
        FunctionLib.DiamondStorage storage fs = FunctionLib.diamondStorage();
        FunctionCallLib.DiamondStorage storage fcs = FunctionCallLib
            .diamondStorage();
        uint256 count = 0;
        for (uint256 i = 0; i < fcs.functionCallIds.length; i++) {
            address addr = fcs.functionCallIds[i];
            FunctionCallLib.FunctionCall memory functionCall = fcs
                .functionCalls[addr];
            FunctionLib.SbFunction memory fn = fs.funcs[
                functionCall.functionId
            ];
            if (fn.queueId == queueId && functionCall.executed == false) {
                count++;
            }
        }
        address[] memory addrs = new address[](count);
        FunctionCallLib.FunctionCall[]
            memory calls = new FunctionCallLib.FunctionCall[](count);
        for (uint256 i = 0; i < fcs.functionCallIds.length; i++) {
            address addr = fcs.functionCallIds[i];
            FunctionCallLib.FunctionCall memory functionCall = fcs
                .functionCalls[addr];
            FunctionLib.SbFunction memory fn = fs.funcs[
                functionCall.functionId
            ];
            if (fn.queueId == queueId && functionCall.executed == false) {
                calls[--count] = fcs.functionCalls[addr];
                addrs[count] = addr;
            }
        }
        return (addrs, calls);
    }
}
