//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {OracleQueueLib} from "./OracleQueueLib.sol";
import {PermissionLib} from "../permission/PermissionLib.sol";
import {OracleLib} from "../oracle/OracleLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {UtilLib} from "../util/UtilLib.sol";
import {Recipient} from "../util/Recipient.sol";

contract OracleQueue is Recipient {
    event OracleQueueAccountInit(
        address indexed authority,
        address indexed accountId
    );
    event OracleQueueSetConfig(
        address indexed queueId,
        address indexed authority
    );
    event OracleQueueSetAttestationConfig(
        address indexed queueId,
        address indexed attestationQueueId
    );
    event OracleQueueAddMrEnclave(
        address indexed queueId,
        address indexed attestationQueueId,
        bytes32 mrEnclave
    );
    event OracleQueueRemoveMrEnclave(
        address indexed queueId,
        address indexed attestationQueueId,
        bytes32 mrEnclave
    );
    event OracleQueueSetPermission(
        address indexed queueId,
        address indexed granter,
        address indexed grantee,
        uint256 permission
    );

    function createOracleQueue(
        string calldata name,
        address authority,
        bool unpermissionedFeedsEnabled,
        uint256 maxSize,
        uint256 reward,
        uint256 oracleTimeout
    ) external guarded(GuardType.ALLOWED) {
        address accountId = UtilLib.generateId();
        if (OracleQueueLib.queueExists(accountId)) {
            revert ErrorLib.OracleAlreadyExists(accountId);
        }
        OracleQueueLib.setQueueConfig(
            accountId,
            name,
            authority,
            unpermissionedFeedsEnabled,
            maxSize,
            reward,
            oracleTimeout
        );
        emit OracleQueueAccountInit(authority, accountId);
    }

    function setOracleQueueConfig(
        address queueId,
        string calldata name,
        address authority,
        bool unpermissionedFeedsEnabled,
        uint256 maxSize,
        uint256 reward,
        uint256 oracleTimeout
    ) external guarded(GuardType.ALLOWED) {
        OracleQueueLib.DiamondStorage storage ds = OracleQueueLib
            .diamondStorage();
        address currentAuthority = ds.oracleQueues[queueId].authority;
        if (currentAuthority != msg.sender) {
            revert ErrorLib.InvalidAuthority(currentAuthority, msg.sender);
        }
        OracleQueueLib.setQueueConfig(
            queueId,
            name,
            authority,
            unpermissionedFeedsEnabled,
            maxSize,
            reward,
            oracleTimeout
        );
        emit OracleQueueSetConfig(queueId, authority);
    }

    function setOracleQueueAttestationConfig(
        address queueId,
        address attestationQueueId,
        bytes32[] memory mrEnclaves,
        bool requireValidEnclave,
        bool requireHeartbeatPermission
    ) external guarded(GuardType.ALLOWED) {
        OracleQueueLib.DiamondStorage storage ds = OracleQueueLib
            .diamondStorage();
        OracleQueueLib.OracleQueue storage queue = ds.oracleQueues[queueId];
        if (queue.authority != msg.sender) {
            revert ErrorLib.InvalidAuthority(queue.authority, msg.sender);
        }
        OracleQueueLib.setQueueAttestationConfig(
            queueId,
            attestationQueueId,
            mrEnclaves,
            requireValidEnclave,
            requireHeartbeatPermission
        );
        emit OracleQueueSetAttestationConfig(queueId, attestationQueueId);
    }

    function addMrEnclaveToOracleQueue(
        address queueId,
        bytes32 mrEnclave
    ) external guarded(GuardType.ALLOWED) {
        OracleQueueLib.DiamondStorage storage ds = OracleQueueLib
            .diamondStorage();
        OracleQueueLib.OracleQueue storage queue = ds.oracleQueues[queueId];
        address msgSender = getMsgSender();
        if (queue.authority != msgSender) {
            revert ErrorLib.InvalidAuthority(queue.authority, msgSender);
        }
        OracleQueueLib.addMrEnclaveToOracleQueue(queueId, mrEnclave);
        OracleQueueLib.AttestationConfig
            storage attestationConfig = OracleQueueLib.queueAttestationConfigs(
                queueId
            );
        emit OracleQueueAddMrEnclave(
            queueId,
            attestationConfig.attestationQueueId,
            mrEnclave
        );
    }

    function removeMrEnclaveFromOracleQueue(
        address queueId,
        bytes32 mrEnclave
    ) external guarded(GuardType.ALLOWED) {
        OracleQueueLib.DiamondStorage storage ds = OracleQueueLib
            .diamondStorage();
        OracleQueueLib.OracleQueue storage queue = ds.oracleQueues[queueId];
        OracleQueueLib.AttestationConfig
            storage attestationConfig = OracleQueueLib.queueAttestationConfigs(
                queueId
            );

        if (queue.authority != msg.sender) {
            revert ErrorLib.InvalidAuthority(queue.authority, msg.sender);
        }

        bool foundMrEnclave = OracleQueueLib.removeMrEnclaveFromOracleQueue(
            queueId,
            mrEnclave
        );

        if (!foundMrEnclave) {
            revert ErrorLib.InvalidArgument(1);
        }

        emit OracleQueueRemoveMrEnclave(
            queueId,
            attestationConfig.attestationQueueId,
            mrEnclave
        );
    }

    // set queue-scoped permissions for a given oracle queue
    // permission is a bitfield of the permissions to set
    // on is a boolean indicating whether to set or unset the permissions
    function setOracleQueuePermission(
        address queueId,
        address grantee,
        uint256 permission,
        bool on
    ) external guarded(GuardType.ALLOWED) {
        OracleQueueLib.DiamondStorage storage ds = OracleQueueLib
            .diamondStorage();
        OracleQueueLib.OracleQueue storage queue = ds.oracleQueues[queueId];
        if (queue.authority != msg.sender) {
            revert ErrorLib.InvalidAuthority(queue.authority, msg.sender);
        }
        PermissionLib.setPermission(queueId, grantee, permission, on);
        emit OracleQueueSetPermission(queueId, msg.sender, grantee, permission);
    }

    /**
     * view functions
     *
     * getOracles - get the list of oracles for a given queue
     * getOracleIdx - get the index of an oracle in a given queue
     * getQueueAllowedMrEnclaves - get the list of mrEnclaves allowed for a given queue
     * queues - get a given queue
     * queueAttestationConfigs - get the attestation config for a given queue
     */
    function getOracles(
        address queueId
    ) external view returns (address[] memory) {
        OracleQueueLib.DiamondStorage storage ds = OracleQueueLib
            .diamondStorage();
        return ds.oracleQueues[queueId].oracles;
    }

    function getOracleIdx(address oracleId) external view returns (int256) {
        OracleQueueLib.DiamondStorage storage ds = OracleQueueLib
            .diamondStorage();
        OracleQueueLib.OracleQueue memory queue = ds.oracleQueues[
            OracleLib.oracles(oracleId).queueId
        ];
        for (uint256 i = 0; i < queue.oracles.length; i++) {
            if (queue.oracles[i] == oracleId) {
                return int256(i);
            }
        }
        return -1;
    }

    function getOracleQueueAllowedMrEnclaves(
        address queueId
    ) external view returns (bytes32[] memory) {
        OracleQueueLib.DiamondStorage storage ds = OracleQueueLib
            .diamondStorage();
        OracleQueueLib.AttestationConfig storage config = ds
            .queueAttestationConfigs[queueId];
        return config.mrEnclaves;
    }

    function oracleQueues(
        address queueId
    ) external view returns (OracleQueueLib.OracleQueue memory) {
        return OracleQueueLib.oracleQueues(queueId);
    }

    function queueAttestationConfigs(
        address queueId
    ) external view returns (OracleQueueLib.AttestationConfig memory) {
        return OracleQueueLib.queueAttestationConfigs(queueId);
    }
}
