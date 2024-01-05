//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library AttestationQueueLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.attestationQueue.storage");

    struct AttestationQueue {
        address authority;
        address[] data;
        uint256 maxSize;
        uint256 reward;
        uint256 lastHeartbeat;
        bytes32[] mrEnclaves;
        uint256 maxEnclaveVerificationAge;
        uint256 allowAuthorityOverrideAfter;
        uint256 maxConsecutiveFunctionFailures;
        bool requireAuthorityHeartbeatPermission; // require heartbeat permission to heartbeat
        bool requireUsagePermissions; // require permissions to enclave verify
        // queue state tracking
        uint256 enclaveTimeout;
        uint256 gcIdx;
        uint256 currIdx;
    }

    struct DiamondStorage {
        mapping(address => AttestationQueue) attestationQueues;
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

    function attestationQueues(
        address queueId
    ) internal view returns (AttestationQueue storage) {
        return diamondStorage().attestationQueues[queueId];
    }

    function queueExists(address queueId) internal view returns (bool) {
        return
            diamondStorage().attestationQueues[queueId].authority != address(0);
    }

    function push(address queueId, address enclaveId) internal {
        diamondStorage().attestationQueues[queueId].data.push(enclaveId);
    }

    function swapRemove(address queueId, uint256 idx) internal {
        DiamondStorage storage ds = diamondStorage();
        AttestationQueue storage queue = ds.attestationQueues[queueId];
        uint256 lastIdx = queue.data.length - 1;
        queue.data[idx] = queue.data[lastIdx];
        queue.data.pop();
        queue.gcIdx = queue.gcIdx < queue.data.length ? queue.gcIdx : 0;
        queue.currIdx = queue.currIdx < queue.data.length ? queue.currIdx : 0;
    }

    function incrementGC(address queueId) internal {
        DiamondStorage storage ds = diamondStorage();
        AttestationQueue storage queue = ds.attestationQueues[queueId];
        queue.gcIdx++;
        queue.gcIdx = queue.gcIdx < queue.data.length ? queue.gcIdx : 0;
    }

    function incrementCurrIdx(address queueId) internal {
        DiamondStorage storage ds = diamondStorage();
        AttestationQueue storage queue = ds.attestationQueues[queueId];
        queue.currIdx++;
        queue.currIdx = queue.currIdx < queue.data.length ? queue.currIdx : 0;
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
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        AttestationQueue storage queue = ds.attestationQueues[queueId];
        queue.authority = authority;
        queue.maxSize = maxSize;
        queue.reward = reward;
        queue.enclaveTimeout = enclaveTimeout;
        queue.maxEnclaveVerificationAge = maxEnclaveVerificationAge;
        queue.allowAuthorityOverrideAfter = allowAuthorityOverrideAfter;
        queue
            .requireAuthorityHeartbeatPermission = requireAuthorityHeartbeatPermission;
        queue.requireUsagePermissions = requireUsagePermissions;
        queue.maxConsecutiveFunctionFailures = maxConsecutiveFunctionFailures;
    }

    function addMrEnclaveToAttestationQueue(
        address queueId,
        bytes32 mrEnclave
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        AttestationQueue storage queue = ds.attestationQueues[queueId];
        queue.mrEnclaves.push(mrEnclave);
    }

    function removeMrEnclaveFromAttestationQueue(
        address queueId,
        bytes32 mrEnclave
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        AttestationQueue storage queue = ds.attestationQueues[queueId];
        for (uint256 i = 0; i < queue.mrEnclaves.length; i++) {
            if (queue.mrEnclaves[i] == mrEnclave) {
                queue.mrEnclaves[i] = queue.mrEnclaves[
                    queue.mrEnclaves.length - 1
                ];
                queue.mrEnclaves.pop();
                break;
            }
        }
    }

    function setLastHeartbeat(address queueId) internal {
        DiamondStorage storage ds = diamondStorage();
        AttestationQueue storage queue = ds.attestationQueues[queueId];
        queue.lastHeartbeat = block.timestamp;
    }
}
