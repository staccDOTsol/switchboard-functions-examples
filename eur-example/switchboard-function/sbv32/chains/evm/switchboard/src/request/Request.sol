//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {RequestLib} from "./RequestLib.sol";
import {FunctionLib} from "../sbFunction/FunctionLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {UtilLib} from "../util/UtilLib.sol";
import {Recipient} from "../util/Recipient.sol";
import {FunctionSettingsLib} from "../functionSettings/FunctionSettingsLib.sol";
import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";

contract Request is Recipient {
    event RequestEvent(
        address indexed functionId,
        address indexed sender,
        address indexed requestId,
        bytes params
    );
    event RequestFund(
        address indexed functionId,
        address indexed funder,
        uint256 amount
    );
    event RequestWithdraw(
        address indexed functionId,
        address indexed funder,
        uint256 amount
    );

    function sendRequest(
        address functionId,
        bytes memory params
    ) external payable returns (address id) {
        id = UtilLib.generateId();
        sendDelayedRequest(id, functionId, params, 0);
    }

    function sendRequestWithId(
        address requestId,
        address functionId,
        bytes memory params
    ) external payable returns (address id) {
        sendDelayedRequest(requestId, functionId, params, 0);
        return requestId;
    }

    function sendDelayedRequest(
        address requestId,
        address functionId,
        bytes memory params,
        uint256 startAfter
    ) public payable guarded(GuardType.PUBLIC) {
        address msgSender = getMsgSender();

        if (RequestLib.requestExists(requestId)) {
            revert ErrorLib.RequestAlreadyExists(requestId);
        }

        if (!FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionDoesNotExist(functionId);
        }

        FunctionLib.SbFunction storage fn = FunctionLib.funcs(functionId);
        FunctionSettingsLib.FunctionSettings
            memory settings = FunctionSettingsLib.functionSettings(functionId);

        if (
            settings.requestsRequireAuthorization && fn.authority != msgSender
        ) {
            revert ErrorLib.InvalidAuthority(fn.authority, msgSender);
        }

        if (settings.requestFee > 0 && msg.value < settings.requestFee) {
            revert ErrorLib.FunctionFeeTooLow(
                functionId,
                settings.requestFee,
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
        RequestLib.setRequest(
            requestId,
            functionId,
            msgSender,
            params,
            msg.value,
            startAfter
        );
        RequestLib.pushRequestId(requestId);

        // increment trigger count so function can tell how many calls have been made
        emit RequestEvent(functionId, msgSender, requestId, params);
    }

    // Get the set of calls that need to be addressed with params for a particular function
    function requests(
        address requestId
    ) external view returns (RequestLib.Request memory) {
        RequestLib.DiamondStorage storage fcs = RequestLib.diamondStorage();
        return fcs.requests[requestId];
    }

    // Get the set of calls that need to be addressed with params for a particular function
    function getActiveRequestsByQueue(
        address queueId
    ) external view returns (address[] memory, RequestLib.Request[] memory) {
        FunctionLib.DiamondStorage storage fs = FunctionLib.diamondStorage();
        RequestLib.DiamondStorage storage fcs = RequestLib.diamondStorage();
        uint256 count = 0;
        for (uint256 i = 0; i < fcs.requestIds.length; i++) {
            address addr = fcs.requestIds[i];
            RequestLib.Request memory request = fcs.requests[addr];
            bool isActive = request.status ==
                FunctionLib.FunctionStatus.ACTIVE ||
                request.status == FunctionLib.FunctionStatus.NONE;
            FunctionLib.SbFunction memory fn = fs.funcs[request.functionId];
            if (
                fn.queueId == queueId &&
                request.executed == false &&
                request.startAfter <= block.timestamp &&
                request.balance > 0 &&
                isActive
            ) {
                count++;
            }
        }

        address[] memory addrs = new address[](count);
        RequestLib.Request[] memory calls = new RequestLib.Request[](count);
        for (uint256 i = 0; i < fcs.requestIds.length; i++) {
            address addr = fcs.requestIds[i];
            RequestLib.Request memory request = fcs.requests[addr];
            FunctionLib.SbFunction memory fn = fs.funcs[request.functionId];
            bool isActive = request.status ==
                FunctionLib.FunctionStatus.ACTIVE ||
                request.status == FunctionLib.FunctionStatus.NONE;
            if (
                fn.queueId == queueId &&
                request.executed == false &&
                request.startAfter <= block.timestamp &&
                request.balance > 0 &&
                isActive
            ) {
                calls[--count] = fcs.requests[addr];
                addrs[count] = addr;
            }
        }
        return (addrs, calls);
    }

    function requestFund(
        address requestId
    ) external payable guarded(GuardType.PUBLIC) {
        if (!RequestLib.requestExists(requestId)) {
            revert ErrorLib.RequestAlreadyExists(requestId);
        }
        RequestLib.DiamondStorage storage fcs = RequestLib.diamondStorage();
        FunctionLib.SbFunction storage fn = FunctionLib.funcs(
            fcs.requests[requestId].functionId
        );
        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(fn.queueId);
        RequestLib.Request storage request = fcs.requests[requestId];
        request.executed = false;
        request.balance += msg.value;

        if (request.balance > queue.reward) {
            request.status = FunctionLib.FunctionStatus.ACTIVE;
        } else {
            request.status = FunctionLib.FunctionStatus.OUT_OF_FUNDS;
        }

        emit RequestFund(request.functionId, msg.sender, msg.value);
    }

    function getRequestsByFunctionId(
        address functionId
    ) external view returns (address[] memory, RequestLib.Request[] memory) {
        RequestLib.DiamondStorage storage fcs = RequestLib.diamondStorage();
        uint256 count = 0;
        for (uint256 i = 0; i < fcs.requestIds.length; i++) {
            address addr = fcs.requestIds[i];
            RequestLib.Request memory request = fcs.requests[addr];
            // and check that the request.startAfter is less than the current block timestamp
            if (request.functionId == functionId) {
                count++;
            }
        }

        address[] memory addrs = new address[](count);
        RequestLib.Request[] memory calls = new RequestLib.Request[](count);
        for (uint256 i = 0; i < fcs.requestIds.length; i++) {
            address addr = fcs.requestIds[i];
            RequestLib.Request memory request = fcs.requests[addr];
            if (request.functionId == functionId) {
                calls[--count] = fcs.requests[addr];
                addrs[count] = addr;
            }
        }
        return (addrs, calls);
    }

    function requestWithdrawal(
        address requestId,
        address recipient,
        uint256 amount
    ) external guarded(GuardType.PUBLIC) {
        // TODO: affect status here if out of funds
        RequestLib.DiamondStorage storage fcs = RequestLib.diamondStorage();
        RequestLib.Request storage request = fcs.requests[requestId];

        if (request.executed != true) {
            revert ErrorLib.InvalidArgument(0);
        }

        if (msg.sender != request.authority) {
            revert ErrorLib.InvalidAuthority(request.authority, msg.sender);
        }

        if (amount > request.balance) {
            revert ErrorLib.InsufficientBalance(amount, request.balance);
        }

        request.balance -= amount;

        payable(recipient).transfer(amount);

        emit RequestWithdraw(request.functionId, recipient, amount);
    }
}
