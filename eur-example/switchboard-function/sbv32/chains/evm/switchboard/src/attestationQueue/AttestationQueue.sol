//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {AttestationQueueLib} from "./AttestationQueueLib.sol";
import {EnclaveLib} from "../enclave/EnclaveLib.sol";
import {PermissionLib} from "../permission/PermissionLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {UtilLib} from "../util/UtilLib.sol";

import {Recipient} from "../util/Recipient.sol";

contract AttestationQueue is Recipient {
    event AttestationQueueAccountInit(
        address indexed authority,
        address indexed accountId
    );
    event AddMrEnclave(address indexed queueId, bytes32 mrEnclave);
    event RemoveMrEnclave(address indexed queueId, bytes32 mrEnclave);
    event AttestationQueueSetConfig(
        address indexed queueId,
        address indexed authority
    );
    event AttestationQueuePermissionUpdated(
        address indexed queueId,
        address indexed granter,
        address indexed grantee,
        uint256 permission
    );

    function createAttestationQueue(
        address authority,
        uint256 maxSize,
        uint256 reward,
        uint256 enclaveTimeout,
        uint256 maxEnclaveVerificationAge,
        uint256 allowAuthorityOverrideAfter,
        bool requireAuthorityHeartbeatPermission,
        bool requireUsagePermissions,
        uint256 maxConsecutiveFunctionFailures
    ) external guarded(GuardType.ALLOWED) {
        address accountId = UtilLib.generateId();
        if (AttestationQueueLib.queueExists(accountId)) {
            revert ErrorLib.AttestationQueueAlreadyExists(accountId);
        }
        AttestationQueueLib.setAttestationQueueConfig(
            accountId,
            authority,
            maxSize,
            reward,
            enclaveTimeout,
            maxEnclaveVerificationAge,
            allowAuthorityOverrideAfter,
            requireAuthorityHeartbeatPermission,
            requireUsagePermissions,
            maxConsecutiveFunctionFailures
        );
        emit AttestationQueueAccountInit(authority, accountId);
    }

    function setAttestationQueueConfig(
        address queueId,
        address authority,
        uint256 maxSize,
        uint256 reward,
        uint256 enclaveTimeout,
        uint256 maxEnclaveVerificationAge,
        uint256 allowAuthorityOverrideAfter,
        bool requireAuthorityHeartbeatPermission,
        bool requireUsagePermissions,
        uint256 maxConsecutiveFunctionFailures
    ) external guarded(GuardType.ALLOWED) {
        AttestationQueueLib.DiamondStorage storage ds = AttestationQueueLib
            .diamondStorage();

        // get attestation queue
        AttestationQueueLib.AttestationQueue storage queue = ds
            .attestationQueues[queueId];

        // check that the sender is the queue authority
        if (msg.sender != queue.authority) {
            revert ErrorLib.InvalidAuthority(queue.authority, msg.sender);
        }

        AttestationQueueLib.setAttestationQueueConfig(
            queueId,
            authority,
            maxSize,
            reward,
            enclaveTimeout,
            maxEnclaveVerificationAge,
            allowAuthorityOverrideAfter,
            requireAuthorityHeartbeatPermission,
            requireUsagePermissions,
            maxConsecutiveFunctionFailures
        );

        emit AttestationQueueSetConfig(queueId, authority);
    }

    function addMrEnclaveToAttestationQueue(
        address queueId,
        bytes32 mrEnclave
    ) external guarded(GuardType.ALLOWED) {
        AttestationQueueLib.DiamondStorage storage ds = AttestationQueueLib
            .diamondStorage();

        // get attestation queue
        AttestationQueueLib.AttestationQueue storage queue = ds
            .attestationQueues[queueId];

        address msgSender = getMsgSender();

        // check that the sender is the queue authority
        if (msgSender != queue.authority) {
            revert ErrorLib.InvalidAuthority(queue.authority, msgSender);
        }

        // check that the mrEnclave is not already in the list
        if (UtilLib.containsBytes32(queue.mrEnclaves, mrEnclave)) {
            revert ErrorLib.MrEnclaveNotAllowed(queueId, mrEnclave);
        }

        // add mrEnclave to list
        AttestationQueueLib.addMrEnclaveToAttestationQueue(queueId, mrEnclave);
        emit AddMrEnclave(queueId, mrEnclave);
    }

    function removeMrEnclaveFromAttestationQueue(
        address queueId,
        bytes32 mrEnclave
    ) external guarded(GuardType.ALLOWED) {
        AttestationQueueLib.DiamondStorage storage ds = AttestationQueueLib
            .diamondStorage();

        // get attestation queue
        AttestationQueueLib.AttestationQueue storage queue = ds
            .attestationQueues[queueId];

        // check that the sender is the queue authority
        if (msg.sender != queue.authority) {
            revert ErrorLib.InvalidAuthority(queue.authority, msg.sender);
        }

        // check that the mrEnclave is in the list
        if (!UtilLib.containsBytes32(queue.mrEnclaves, mrEnclave)) {
            revert ErrorLib.InvalidArgument(1);
        }

        // swap remove mrEnclave from list
        AttestationQueueLib.removeMrEnclaveFromAttestationQueue(
            queueId,
            mrEnclave
        );
        emit RemoveMrEnclave(queueId, mrEnclave);
    }

    function setAttestationQueuePermission(
        address queueId,
        address grantee,
        uint256 permission,
        bool on
    ) external guarded(GuardType.ALLOWED) {
        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(queueId);
        address sender = getMsgSender();
        if (queue.authority != sender) {
            revert ErrorLib.InvalidAuthority(queue.authority, sender);
        }

        PermissionLib.setPermission(queueId, grantee, permission, on);
        emit AttestationQueuePermissionUpdated(
            queueId,
            sender,
            grantee,
            permission
        );
    }

    /**
     * view functions
     *
     * attestationQueues - get an attestation queue by id
     * attestationQueueHasMrEnclave - check if a queue has an enclave measurement
     * getEnclaveIdx - get the index of a enclave in a queue
     * getMrEnclaves - get the permitted mrEnclaves of a queue
     * getEnclaves - get the enclaves on a queue
     */

    function attestationQueues(
        address queueId
    ) external view returns (AttestationQueueLib.AttestationQueue memory) {
        return AttestationQueueLib.attestationQueues(queueId);
    }

    function attestationQueueHasMrEnclave(
        address queueId,
        bytes32 mrEnclave
    ) external view returns (bool) {
        AttestationQueueLib.DiamondStorage storage ds = AttestationQueueLib
            .diamondStorage();

        AttestationQueueLib.AttestationQueue memory queue = ds
            .attestationQueues[queueId];
        return UtilLib.containsBytes32(queue.mrEnclaves, mrEnclave);
    }

    function getEnclaveIdx(address enclaveId) external view returns (int256) {
        AttestationQueueLib.DiamondStorage storage ds = AttestationQueueLib
            .diamondStorage();
        AttestationQueueLib.AttestationQueue memory queue = ds
            .attestationQueues[EnclaveLib.enclaves(enclaveId).queueId];
        for (uint256 i = 0; i < queue.data.length; i++) {
            if (queue.data[i] == enclaveId) {
                return int256(i);
            }
        }
        return -1;
    }

    function getAttestationQueueMrEnclaves(
        address queueId
    ) external view returns (bytes32[] memory) {
        AttestationQueueLib.DiamondStorage storage ds = AttestationQueueLib
            .diamondStorage();
        AttestationQueueLib.AttestationQueue memory queue = ds
            .attestationQueues[queueId];
        return queue.mrEnclaves;
    }

    function getEnclaves(
        address queueId
    ) external view returns (address[] memory) {
        AttestationQueueLib.DiamondStorage storage ds = AttestationQueueLib
            .diamondStorage();
        AttestationQueueLib.AttestationQueue memory queue = ds
            .attestationQueues[queueId];
        return queue.data;
    }
}
