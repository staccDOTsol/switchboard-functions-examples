//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library OracleQueueLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.oracleQueue.storage");

    struct OracleQueue {
        string name;
        address authority;
        address[] oracles;
        bool unpermissionedFeedsEnabled;
        uint256 maxSize;
        uint256 reward;
        uint256 oracleTimeout;
        uint256 gcIdx;
        uint256 currIdx;
    }

    struct AttestationConfig {
        address attestationQueueId;
        bytes32[] mrEnclaves;
        bool requireValidEnclave;
        bool requireHeartbeatPermission;
    }

    struct DiamondStorage {
        mapping(address => OracleQueue) oracleQueues;
        mapping(address => AttestationConfig) queueAttestationConfigs;
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

    function oracleQueues(
        address queueId
    ) internal view returns (OracleQueueLib.OracleQueue storage) {
        return diamondStorage().oracleQueues[queueId];
    }

    function queueAttestationConfigs(
        address queueId
    ) internal view returns (OracleQueueLib.AttestationConfig storage) {
        return diamondStorage().queueAttestationConfigs[queueId];
    }

    function queueExists(address queueId) internal view returns (bool) {
        return diamondStorage().oracleQueues[queueId].authority != address(0);
    }

    function push(address queueId, address oracleId) internal {
        diamondStorage().oracleQueues[queueId].oracles.push(oracleId);
    }

    function swapRemove(address queueId, uint256 idx) internal {
        DiamondStorage storage ds = diamondStorage();
        OracleQueue storage queue = ds.oracleQueues[queueId];
        uint256 lastIdx = queue.oracles.length - 1;
        queue.oracles[idx] = queue.oracles[lastIdx];
        queue.oracles.pop();
        queue.gcIdx = queue.gcIdx < queue.oracles.length ? queue.gcIdx : 0;
        queue.currIdx = queue.currIdx < queue.oracles.length
            ? queue.currIdx
            : 0;
    }

    function incrementGC(address queueId) internal {
        DiamondStorage storage ds = diamondStorage();
        OracleQueue storage queue = ds.oracleQueues[queueId];
        queue.gcIdx++;
        queue.gcIdx = queue.gcIdx < queue.oracles.length ? queue.gcIdx : 0;
    }

    function incrementCurrIdx(address queueId) internal {
        DiamondStorage storage ds = diamondStorage();
        OracleQueue storage queue = ds.oracleQueues[queueId];
        queue.currIdx++;
        if (queue.currIdx >= queue.oracles.length) {
            queue.currIdx = 0;
        }
    }

    function setQueueConfig(
        address queueId,
        string calldata name,
        address authority,
        bool unpermissionedFeedsEnabled,
        uint256 maxSize,
        uint256 reward,
        uint256 oracleTimeout
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        OracleQueue storage queue = ds.oracleQueues[queueId];
        queue.name = name;
        queue.authority = authority;
        queue.unpermissionedFeedsEnabled = unpermissionedFeedsEnabled;
        queue.maxSize = maxSize;
        queue.reward = reward;
        queue.oracleTimeout = oracleTimeout;
    }

    function setQueueAttestationConfig(
        address queueId,
        address attestationQueueId,
        bytes32[] memory mrEnclaves,
        bool requireValidEnclave,
        bool requireHeartbeatPermission
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        AttestationConfig storage config = ds.queueAttestationConfigs[queueId];
        config.attestationQueueId = attestationQueueId;
        config.mrEnclaves = mrEnclaves;
        config.requireValidEnclave = requireValidEnclave;
        config.requireHeartbeatPermission = requireHeartbeatPermission;
    }

    function addMrEnclaveToOracleQueue(
        address queueId,
        bytes32 mrEnclave
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        AttestationConfig storage config = ds.queueAttestationConfigs[queueId];
        config.mrEnclaves.push(mrEnclave);
    }

    function removeMrEnclaveFromOracleQueue(
        address queueId,
        bytes32 mrEnclave
    ) internal returns (bool) {
        DiamondStorage storage ds = diamondStorage();
        AttestationConfig storage config = ds.queueAttestationConfigs[queueId];
        uint256 idx = 0;
        for (uint256 i = 0; i < config.mrEnclaves.length; i++) {
            if (config.mrEnclaves[i] == mrEnclave) {
                idx = i;
                break;
            }
        }

        if (idx == config.mrEnclaves.length) {
            return false;
        }

        uint256 lastIdx = config.mrEnclaves.length - 1;
        config.mrEnclaves[idx] = config.mrEnclaves[lastIdx];
        config.mrEnclaves.pop();

        return true;
    }
}
