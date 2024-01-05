//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library FunctionCallLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.functionCall.storage");

    struct FunctionCall {
        address functionId;
        address caller;
        uint256 timestamp;
        bytes callData;
        bool executed;
        uint256 consecutiveFailures;
        uint256 feePaid;
    }

    struct FunctionCallSettings {
        // require the function call to pay the estimated run cost fee
        bool requireEstimatedRunCostFee;
        // minimum fee that a function call must pay
        uint256 minimumFee;
        // maximum gas cost that a function call can cost
        uint256 maxGasCost;
        // fail calls if the caller does not pay the full cost of the call
        bool requireCallerPayFullCost;
        // requires the callback target to be the caller contract
        bool requireSenderBeReturnAddress;
    }

    struct DiamondStorage {
        mapping(address => FunctionCall) functionCalls;
        address[] functionCallIds; // list of all function request addresses
        mapping(address => FunctionCallSettings) functionCallSettings; // function id -> function call settings
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

    function functionCalls(
        address functionCallId
    ) internal view returns (FunctionCall storage) {
        return diamondStorage().functionCalls[functionCallId];
    }

    function functionCallSettings(
        address functionId
    ) internal view returns (FunctionCallSettings storage) {
        return diamondStorage().functionCallSettings[functionId];
    }

    function functionCallExists(
        address functionCallId
    ) internal view returns (bool) {
        return
            diamondStorage().functionCalls[functionCallId].functionId !=
            address(0);
    }

    function setFunctionCall(
        address functionRequestId,
        address functionId,
        address caller,
        bytes memory callData,
        uint256 feePaid
    ) internal {
        // register params for callback verification
        diamondStorage().functionCalls[functionRequestId] = FunctionCall({
            functionId: functionId,
            caller: caller,
            timestamp: block.timestamp,
            callData: callData,
            executed: false,
            consecutiveFailures: 0,
            feePaid: feePaid
        });
    }

    function setFunctionCallSettings(
        address functionId,
        bool requireEstimatedRunCostFee,
        uint256 minimumFee,
        uint256 maxGasCost,
        bool requireCallerPayFullCost,
        bool requireSenderBeReturnAddress
    ) internal {
        FunctionCallSettings storage f = diamondStorage().functionCallSettings[
            functionId
        ];
        f.requireEstimatedRunCostFee = requireEstimatedRunCostFee;
        f.minimumFee = minimumFee;
        f.maxGasCost = maxGasCost;
        f.requireCallerPayFullCost = requireCallerPayFullCost;
        f.requireSenderBeReturnAddress = requireSenderBeReturnAddress;
    }

    function pushFunctionCallId(address functionCallId) internal {
        diamondStorage().functionCallIds.push(functionCallId);
    }

    function setExecuted(address functionCallId) internal {
        diamondStorage().functionCalls[functionCallId].executed = true;
    }

    function incrementConsecutiveFailures(address functionCallId) internal {
        diamondStorage().functionCalls[functionCallId].consecutiveFailures++;
    }
}
