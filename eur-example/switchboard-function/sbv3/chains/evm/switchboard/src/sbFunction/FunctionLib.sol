//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {UtilLib} from "../util/UtilLib.sol";
import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";
import {TransactionLib} from "../transaction/TransactionLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";

library FunctionLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.function.storage");

    enum FunctionStatus {
        NONE,
        ACTIVE,
        NON_EXECUTABLE,
        EXPIRED,
        OUT_OF_FUNDS,
        INVALID_PERMISSIONS,
        DEACTIVATED
    }

    struct SbFunction {
        string name;
        address authority;
        address enclaveId;
        address queueId;
        uint256 balance;
        FunctionStatus status;
        FunctionConfig config;
        FunctionState state;
    }

    struct FunctionConfig {
        string schedule;
        address[] permittedCallers;
        string containerRegistry;
        string container;
        string version;
        string paramsSchema;
        bytes32[] mrEnclaves;
        bool allowAllFnCalls;
        bool useFnCallEscrow;
    }

    struct FunctionState {
        uint256 consecutiveFailures;
        uint256 lastExecutionTimestamp;
        uint256 nextAllowedTimestamp;
        uint256 lastExecutionGasCost;
        uint256 triggeredSince; // first call time in seconds
        uint256 triggerCount; // number of calls
        // queueIdx should only be referenced off-chain
        // - and only with modulo queue length in case the queue is resized
        uint256 queueIdx;
        bool triggered;
        uint256 createdAt;
    }

    struct DiamondStorage {
        mapping(address => SbFunction) funcs; // funcs because of keyword conflict
        address[] functionIds; // list of all function addresses
        uint256 toleratedTimestampDiscrepancy; // allowed discrepancy between block.timestamp and reported timestamp in verify
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

    function functionExists(address functionId) internal view returns (bool) {
        return diamondStorage().funcs[functionId].authority != address(0);
    }

    function escrowFund(address functionId, uint256 amount) internal {
        diamondStorage().funcs[functionId].balance += amount;
        // check function state / set to NONE if out of funds
        SbFunction storage f = diamondStorage().funcs[functionId];
        if (f.status == FunctionStatus.OUT_OF_FUNDS) {
            f.status = FunctionStatus.NONE;
        }
    }

    function escrowWithdraw(address functionId, uint256 amount) internal {
        diamondStorage().funcs[functionId].balance -= amount;
    }

    function funcs(
        address functionId
    ) internal view returns (SbFunction storage) {
        return diamondStorage().funcs[functionId];
    }

    function setTriggered(address functionId, bool triggered) internal {
        diamondStorage().funcs[functionId].state.triggered = triggered;
    }

    function setFunctionConfig(
        address functionId,
        string memory containerRegistry,
        string memory container,
        string memory version,
        string memory schedule,
        string memory paramsSchema,
        address[] memory permittedCallers
    ) internal {
        SbFunction storage f = diamondStorage().funcs[functionId];
        f.config.containerRegistry = containerRegistry;
        f.config.container = container;
        f.config.version = version;
        f.config.schedule = schedule;
        f.config.permittedCallers = permittedCallers;
        f.config.paramsSchema = paramsSchema;
        f.status = FunctionStatus.NONE;
    }

    function setFunctionData(
        address functionId,
        string memory name,
        address authority,
        address enclaveId,
        address queueId
    ) internal {
        SbFunction storage f = diamondStorage().funcs[functionId];
        f.name = name;
        f.authority = authority;
        f.enclaveId = enclaveId;
        f.queueId = queueId;
    }

    function setFunctionSuccess(
        address functionId,
        uint256 nextAllowedTimestamp
    ) internal {
        SbFunction storage fn = diamondStorage().funcs[functionId];
        fn.state.lastExecutionTimestamp = block.timestamp;
        fn.state.nextAllowedTimestamp = nextAllowedTimestamp;
        fn.status = FunctionLib.FunctionStatus.ACTIVE;
    }

    function pushFunctionId(address functionId) internal {
        diamondStorage().functionIds.push(functionId);
    }

    function setConsecutiveFailures(
        address functionId,
        uint256 failures
    ) internal {
        diamondStorage().funcs[functionId].state.consecutiveFailures = failures;
    }

    function setFunctionStatus(
        address functionId,
        FunctionStatus status
    ) internal {
        diamondStorage().funcs[functionId].status = status;
    }

    function setQueueIdx(address functionId, uint256 queueIdx) internal {
        diamondStorage().funcs[functionId].state.queueIdx = queueIdx;
    }

    function setTriggeredSince(
        address functionId,
        uint256 triggeredSince
    ) internal {
        diamondStorage()
            .funcs[functionId]
            .state
            .triggeredSince = triggeredSince;
    }

    function incrementTriggerCount(address functionId) internal {
        diamondStorage().funcs[functionId].state.triggerCount++;
    }

    function setCreatedAt(address functionId, uint256 createdAt) internal {
        diamondStorage().funcs[functionId].state.createdAt = createdAt;
    }

    function addMrEnclaveToFunction(
        address functionId,
        bytes32 mrEnclave
    ) internal {
        bytes32[] storage allowedMrEnclaves = diamondStorage()
            .funcs[functionId]
            .config
            .mrEnclaves;
        int256 index = UtilLib.indexOfBytes32(allowedMrEnclaves, mrEnclave);
        if (index < 0) {
            allowedMrEnclaves.push(mrEnclave);
        }
    }

    function removeMrEnclaveFromFunction(
        address functionId,
        bytes32 mrEnclave
    ) internal {
        bytes32[] storage allowedMrEnclaves = diamondStorage()
            .funcs[functionId]
            .config
            .mrEnclaves;
        int256 index = UtilLib.indexOfBytes32(allowedMrEnclaves, mrEnclave);
        if (index > 0) {
            allowedMrEnclaves[uint256(index)] = allowedMrEnclaves[
                allowedMrEnclaves.length - 1
            ];
            allowedMrEnclaves.pop();
        }
    }

    function isMrEnclaveAllowedForFunction(
        address functionId,
        bytes32 mrEnclave
    ) internal view returns (bool) {
        // TOOD: @ahermida
        // return true;
        bytes32[] storage allowedMrEnclaves = diamondStorage()
            .funcs[functionId]
            .config
            .mrEnclaves;
        return UtilLib.indexOfBytes32(allowedMrEnclaves, mrEnclave) >= 0;
    }

    function getAllowedMrEnclaves(
        address functionId
    ) internal view returns (bytes32[] memory) {
        return diamondStorage().funcs[functionId].config.mrEnclaves;
    }

    function setTriggeredCount(
        address functionId,
        uint256 triggeredCount
    ) internal {
        diamondStorage().funcs[functionId].state.triggerCount = triggeredCount;
    }

    function setToleratedTimestampDiscrepancy(
        uint256 toleratedTimestampDiscrepancy
    ) internal {
        diamondStorage()
            .toleratedTimestampDiscrepancy = toleratedTimestampDiscrepancy;
    }

    // set last execution gas cost
    function setLastExecutionGasCost(
        address functionId,
        uint256 lastExecutionGasCost
    ) internal {
        diamondStorage()
            .funcs[functionId]
            .state
            .lastExecutionGasCost = lastExecutionGasCost;
    }

    function getToleratedTimestampDiscrepancy()
        internal
        view
        returns (uint256)
    {
        uint256 toleratedDiscrepancy = diamondStorage()
            .toleratedTimestampDiscrepancy;
        return toleratedDiscrepancy == 0 ? 60 : toleratedDiscrepancy;
    }

    function estimateRunCost(
        address functionId,
        uint256 gasPrice
    ) internal view returns (uint256) {
        SbFunction storage fn = diamondStorage().funcs[functionId];
        uint256 reward = AttestationQueueLib
            .attestationQueues(fn.queueId)
            .reward;
        uint256 recentGasCost = fn.state.lastExecutionGasCost;
        return gasPrice * (reward + recentGasCost);
    }
}
