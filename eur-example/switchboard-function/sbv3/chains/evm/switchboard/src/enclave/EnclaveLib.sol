//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";
import {StakingLib} from "../staking/StakingLib.sol";
import {UtilLib} from "../util/UtilLib.sol";

library EnclaveLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.enclave.storage");

    // Enclave Verification Status
    enum VerificationStatus {
        PENDING,
        FAILURE,
        SUCCESS,
        OVERRIDE
    }

    struct Enclave {
        address signer;
        address authority;
        address queueId;
        bytes cid;
        VerificationStatus verificationStatus;
        uint256 verificationTimestamp;
        uint256 validUntil;
        bytes32 mrEnclave;
        // verifiers
        bool isOnQueue;
        uint256 lastHeartbeat;
        // balance of the Enclave
        uint256 balance;
    }

    struct DiamondStorage {
        mapping(address => Enclave) enclaves;
        mapping(address => address) enclaveSignerToEnclaveId;
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

    function enclaveExists(address enclaveId) internal view returns (bool) {
        return diamondStorage().enclaves[enclaveId].signer != address(0);
    }

    function enclaves(
        address enclaveId
    ) internal view returns (EnclaveLib.Enclave storage) {
        return diamondStorage().enclaves[enclaveId];
    }

    function enclaveSignerToEnclaveId(
        address signer
    ) internal view returns (address) {
        return diamondStorage().enclaveSignerToEnclaveId[signer];
    }

    function setEnclaveVerficationStatus(
        address enclaveId,
        VerificationStatus status
    ) internal {
        diamondStorage().enclaves[enclaveId].verificationStatus = status;
    }

    function setEnclaveConfig(
        address enclaveId,
        address signer,
        address authority,
        address queueId
    ) internal {
        Enclave storage enclave = diamondStorage().enclaves[enclaveId];
        enclave.signer = signer;
        enclave.authority = authority;
        enclave.queueId = queueId;
        enclave.verificationStatus = VerificationStatus.FAILURE; // enclave initially will be set to failure
    }

    function setCIDAndPending(address enclaveId, bytes memory cid) internal {
        Enclave storage enclave = diamondStorage().enclaves[enclaveId];
        enclave.cid = cid;
        enclave.verificationStatus = VerificationStatus.PENDING;
    }

    function setEnclaveFailure(address enclaveId) internal {
        diamondStorage()
            .enclaves[enclaveId]
            .verificationStatus = VerificationStatus.FAILURE;
    }

    function setEnclaveMeasurementAndSuccess(
        address enclaveId,
        bytes32 mrEnclave,
        uint256 validUntil
    ) internal {
        Enclave storage enclave = diamondStorage().enclaves[enclaveId];
        enclave.verificationStatus = VerificationStatus.SUCCESS;
        enclave.verificationTimestamp = block.timestamp;
        enclave.validUntil = validUntil;
        enclave.mrEnclave = mrEnclave;
    }

    function setSignerToEnclaveId(address signer, address enclaveId) internal {
        diamondStorage().enclaveSignerToEnclaveId[signer] = enclaveId;
    }

    function setIsOnQueue(address enclaveId, bool isOnQueue) internal {
        diamondStorage().enclaves[enclaveId].isOnQueue = isOnQueue;
    }

    function setLastHeartbeat(address enclaveId) internal {
        diamondStorage().enclaves[enclaveId].lastHeartbeat = block.timestamp;
    }

    function forceOverrideVerify(
        address enclaveId,
        uint256 validUntil
    ) internal {
        Enclave storage enclave = diamondStorage().enclaves[enclaveId];
        enclave.verificationStatus = VerificationStatus.OVERRIDE;
        enclave.verificationTimestamp = block.timestamp;
        enclave.validUntil = validUntil;
    }

    function fundEnclave(address enclaveId, uint256 amount) internal {
        diamondStorage().enclaves[enclaveId].balance += amount;
    }

    function withdrawEnclave(address enclaveId, uint256 amount) internal {
        diamondStorage().enclaves[enclaveId].balance -= amount;
    }

    // Check if a enclave is valid and has been verified
    function isEnclaveValid(
        address enclaveId,
        Enclave storage enclave,
        AttestationQueueLib.AttestationQueue storage queue
    ) internal view returns (bool) {
        if (
            enclave.verificationStatus == EnclaveLib.VerificationStatus.OVERRIDE
        ) {
            return true;
        }

        // check that the enclave is fully staked if needed
        if (!StakingLib.isEnclaveFullyStaked(enclave.queueId, enclaveId)) {
            return false;
        }

        // check that the enclave is not already expired
        if (enclave.validUntil < block.timestamp) {
            return false;
        }

        if (!UtilLib.containsBytes32(queue.mrEnclaves, enclave.mrEnclave)) {
            return false;
        }

        // Ensure that the enclave is verified
        if (
            enclave.verificationStatus != EnclaveLib.VerificationStatus.SUCCESS
        ) {
            return false;
        }

        return true;
    }
}
