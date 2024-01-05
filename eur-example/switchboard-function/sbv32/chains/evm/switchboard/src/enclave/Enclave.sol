//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {Recipient} from "../util/Recipient.sol";
import {EnclaveLib} from "./EnclaveLib.sol";

import {StakingLib} from "../staking/StakingLib.sol";
import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";
import {PermissionLib} from "../permission/PermissionLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {UtilLib} from "../util/UtilLib.sol";

import {Recipient} from "../util/Recipient.sol";

contract Enclave is Recipient {
    event EnclaveAccountInit(address indexed signer, address indexed accountId);
    event EnclaveHeartbeat(address indexed enclaveId, address indexed signer);
    event EnclaveGC(address indexed enclaveId, address indexed queue);
    event EnclavePayoutEvent(
        address indexed nodeId,
        address indexed enclaveId,
        uint256 indexed amount
    );
    event EnclaveVerifyRequest(
        address indexed queueId,
        address indexed verifier,
        address indexed verifiee
    );
    event EnclaveRotateSigner(
        address indexed queueId,
        address indexed oldSigner,
        address indexed newSigner
    );

    function createEnclave(
        address signer,
        address queueId,
        address authority
    ) external {
        address accountId = UtilLib.generateId();
        // @NOTE: Guarded from reentrancy by downstream createEnclaveWithId
        createEnclaveWithId(accountId, signer, queueId, authority);
    }

    // Create an enclave with a specific id
    // @NOTE: guarded from reentrancy, but not ACL controled.
    // If we ACL control this function, we will limit the ability to create functions to allowed addresses
    // Which may be what we want. But for now, we are leaving it open.
    function createEnclaveWithId(
        address enclaveId,
        address signer,
        address queueId,
        address authority
    ) public guarded(GuardType.PUBLIC) {
        if (EnclaveLib.enclaveExists(enclaveId) || enclaveId == address(0)) {
            revert ErrorLib.EnclaveAlreadyExists(enclaveId);
        }

        EnclaveLib.setEnclaveConfig(enclaveId, signer, authority, queueId);

        // Log Enclave account creation
        emit EnclaveAccountInit(signer, enclaveId);
    }

    // Update Quote Buffer and Reset Verification Status
    function updateEnclave(
        address enclaveId, // enclave id
        bytes calldata cid
    ) external payable guarded(GuardType.ALLOWED) {
        EnclaveLib.Enclave memory enclave = EnclaveLib.enclaves(enclaveId);

        address msgSender = getMsgSender();

        // Check if sender is enclave signer
        if (msgSender != enclave.signer) {
            revert ErrorLib.InvalidSigner(enclave.signer, msgSender);
        }

        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(enclave.queueId);

        // we pay the verifier queue's reward to verify the enclave
        uint256 verifierReward = queue.reward;
        if (msg.value < verifierReward) {
            revert ErrorLib.InsufficientBalance(verifierReward, msg.value);
        }

        // Add balance to enclave
        EnclaveLib.fundEnclave(enclaveId, msg.value);

        // If the queue requires usage permissions, check that the enclave has them
        // Ultimately this has to be on signer because there shouldn't have to be a enclave for there to be a enclave
        if (
            queue.requireUsagePermissions &&
            !PermissionLib.hasPermission(
                enclave.queueId,
                enclave.signer,
                PermissionLib.getPermissionCode(PermissionLib.Permission.USAGE)
            )
        ) {
            revert ErrorLib.PermissionDenied(
                enclave.queueId,
                enclave.signer,
                PermissionLib.getPermissionCode(PermissionLib.Permission.USAGE)
            );
        }

        // Set signer to enclave ID - important that the signer is authorized
        EnclaveLib.setSignerToEnclaveId(msgSender, enclaveId);

        // Check if enclave exists and create enclave account if it doesn't exist
        if (enclaveId == address(0)) {
            revert ErrorLib.InvalidArgument(0);
        }

        // Set enclave buffer and set to pending
        EnclaveLib.setCIDAndPending(enclaveId, cid);

        // Queue up verify
        address nextQVN = address(0);
        if (queue.data.length != 0) {
            nextQVN = queue.data[queue.currIdx];
            AttestationQueueLib.incrementCurrIdx(enclave.queueId);
        }
        emit EnclaveVerifyRequest(enclave.queueId, nextQVN, enclaveId);
    }

    function forceOverrideVerify(
        address enclaveId
    ) external guarded(GuardType.ALLOWED) {
        EnclaveLib.Enclave memory enclave = EnclaveLib.enclaves(enclaveId);
        AttestationQueueLib.AttestationQueue
            storage verifierQueue = AttestationQueueLib.attestationQueues(
                enclave.queueId
            );
        address msgSender = getMsgSender();

        if (msgSender != verifierQueue.authority) {
            revert ErrorLib.InvalidAuthority(
                verifierQueue.authority,
                msgSender
            );
        }

        if (
            (block.timestamp - verifierQueue.lastHeartbeat) >
            verifierQueue.allowAuthorityOverrideAfter &&
            verifierQueue.allowAuthorityOverrideAfter != 0
        ) {
            // verify the enclave
            EnclaveLib.forceOverrideVerify(
                enclaveId,
                block.timestamp + verifierQueue.maxEnclaveVerificationAge
            );

            // queue up verify
            address nextQVN = address(0);
            if (verifierQueue.data.length != 0) {
                nextQVN = verifierQueue.data[verifierQueue.currIdx];
                AttestationQueueLib.incrementCurrIdx(enclave.queueId);
            }

            // Emit Enclave Verify Request
            emit EnclaveVerifyRequest(enclave.queueId, nextQVN, enclaveId);
        } else {
            revert ErrorLib.ForceOverrideNotReady(enclave.queueId);
        }
    }

    function enclaveGarbageCollect(
        address enclaveId,
        uint256 enclaveIdx
    ) external guarded(GuardType.PUBLIC) {
        EnclaveLib.Enclave memory enclave = EnclaveLib.enclaves(enclaveId);
        AttestationQueueLib.AttestationQueue
            storage verifierQueue = AttestationQueueLib.attestationQueues(
                enclave.queueId
            );

        if (!enclave.isOnQueue) {
            revert ErrorLib.EnclaveNotOnQueue(enclave.queueId, enclaveId);
        }

        if (verifierQueue.data[enclaveIdx] != enclaveId) {
            revert ErrorLib.EnclaveNotAtQueueIdx(
                enclave.queueId,
                enclaveId,
                enclaveIdx
            );
        }

        // atteastation queue authority can remove the oracle at any time
        if (
            enclave.signer == msg.sender ||
            enclave.lastHeartbeat + verifierQueue.enclaveTimeout <
            block.timestamp
        ) {
            // log the garbage collection
            emit EnclaveGC(enclaveId, enclave.queueId);
            uint256 gcIdx = uint256(enclaveIdx);
            EnclaveLib.setIsOnQueue(enclaveId, false);
            AttestationQueueLib.swapRemove(enclave.queueId, gcIdx);
        }
    }

    // Verify Enclave Buffer
    function failEnclave(
        address verifierId, // caller's enclave address
        address enclaveId, // enclave address to be verified
        uint256 verifierIdx
    ) external guarded(GuardType.ALLOWED) {
        // get the caller
        address msgSender = getMsgSender();

        // get verifier enclave
        EnclaveLib.Enclave memory verifier = EnclaveLib.enclaves(verifierId);

        // get enclave being verified
        EnclaveLib.Enclave memory enclave = EnclaveLib.enclaves(enclaveId);

        // get verifier queue
        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(enclave.queueId);

        // check that the sender is the verifier enclave's signer
        if (msgSender != verifier.signer) {
            revert ErrorLib.InvalidSigner(verifier.signer, msgSender);
        }

        // check that the enclaves are on the same queue
        if (enclave.queueId != verifier.queueId) {
            revert ErrorLib.QueuesDoNotMatch(verifier.queueId, enclave.queueId);
        }

        // only works for pending enclaves (or verification override)
        if (
            enclave.verificationStatus !=
            EnclaveLib.VerificationStatus.PENDING &&
            enclave.verificationStatus != EnclaveLib.VerificationStatus.OVERRIDE
        ) {
            revert ErrorLib.EnclaveUnverified(enclaveId);
        }

        // check that enclave is on queue
        if (queue.data[verifierIdx] != verifierId) {
            revert ErrorLib.EnclaveNotAtQueueIdx(
                enclave.queueId,
                verifierId,
                verifierIdx
            );
        }

        // validate the enclave of the verifier enclave
        if (!isEnclaveValid(verifierId)) {
            revert ErrorLib.InvalidEnclave(verifierId);
        }

        // write enclave failure
        EnclaveLib.setEnclaveFailure(enclaveId);

        uint256 withdrawable = queue.reward;

        if (enclave.balance < queue.reward) {
            withdrawable = enclave.balance;
        }

        // withdraw the reward from the enclave and send to the verifier's authority
        EnclaveLib.withdrawEnclave(enclaveId, withdrawable);
        emit EnclavePayoutEvent(verifierId, enclaveId, withdrawable);
        payable(verifier.authority).transfer(withdrawable);
    }

    // Verify Enclave Buffer
    function verifyEnclave(
        address verifierId, // caller's enclave/enclave address
        address enclaveId, // enclave address to be verified
        uint256 enclaveIdx, // enclave idx on verifier queue
        uint256 timestamp, // timestamp of enclave (to be validated against block timestamp)
        bytes32 mrEnclave // enclave measurement of enclave
    ) external guarded(GuardType.ALLOWED) {
        address msgSender = getMsgSender();

        // get verifier enclave
        EnclaveLib.Enclave memory verifier = EnclaveLib.enclaves(verifierId);

        // get enclave being verified
        EnclaveLib.Enclave memory enclave = EnclaveLib.enclaves(enclaveId);

        // get verifier queue
        AttestationQueueLib.AttestationQueue
            storage verifierQueue = AttestationQueueLib.attestationQueues(
                enclave.queueId
            );

        // check that the sender is the verifier enclave's signer
        if (msgSender != verifier.signer) {
            revert ErrorLib.InvalidSigner(verifier.signer, msgSender);
        }

        uint256 timestampdiff = UtilLib.abs(
            int256(block.timestamp) - int256(timestamp)
        );

        if (timestampdiff > 20) {
            revert ErrorLib.IncorrectReportedTime(
                block.timestamp + 20,
                timestamp
            );
        }

        // only works for pending enclaves (or verification override)
        if (
            enclave.verificationStatus !=
            EnclaveLib.VerificationStatus.PENDING &&
            enclave.verificationStatus != EnclaveLib.VerificationStatus.OVERRIDE
        ) {
            revert ErrorLib.EnclaveNotReadyForVerification(enclaveId);
        }

        // check that enclave is on queue
        if (verifierQueue.data[enclaveIdx] != verifierId) {
            revert ErrorLib.EnclaveNotAtQueueIdx(
                enclave.queueId,
                verifierId,
                enclaveIdx
            );
        }

        // validate the enclave of the verifier enclave
        if (!isEnclaveValid(verifierId)) {
            revert ErrorLib.InvalidEnclave(verifierId);
        }

        // set verification status to success
        EnclaveLib.setEnclaveMeasurementAndSuccess(
            enclaveId,
            mrEnclave,
            block.timestamp + verifierQueue.maxEnclaveVerificationAge
        );

        uint256 withdrawable = verifierQueue.reward;
        if (enclave.balance < verifierQueue.reward) {
            withdrawable = enclave.balance;
        }

        // withdraw the reward from the enclave and send to the verifier's authority
        EnclaveLib.withdrawEnclave(enclaveId, withdrawable);
        emit EnclavePayoutEvent(verifierId, enclaveId, withdrawable);
        payable(verifier.authority).transfer(withdrawable);
    }

    // Heartbeat onto a queue, crank enclave gc
    function enclaveHeartbeat(
        address enclaveId
    ) external guarded(GuardType.ALLOWED) {
        address msgSender = getMsgSender();

        if (!EnclaveLib.enclaveExists(enclaveId)) {
            revert ErrorLib.EnclaveDoesNotExist(enclaveId);
        }

        EnclaveLib.Enclave storage enclave = EnclaveLib.enclaves(enclaveId);
        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(enclave.queueId);

        if (msgSender != enclave.signer) {
            revert ErrorLib.InvalidSigner(enclave.signer, msgSender);
        }

        // check that enclave still has permissions
        if (
            queue.requireAuthorityHeartbeatPermission &&
            !PermissionLib.hasPermission(
                enclave.queueId,
                enclaveId,
                PermissionLib.getPermissionCode(
                    PermissionLib.Permission.HEARTBEAT
                )
            )
        ) {
            revert ErrorLib.PermissionDenied(
                enclave.queueId,
                enclaveId,
                PermissionLib.getPermissionCode(
                    PermissionLib.Permission.HEARTBEAT
                )
            );
        }

        // allow signer to override heartbeat if we're allowed to
        if (
            (block.timestamp - enclave.lastHeartbeat) >
            queue.allowAuthorityOverrideAfter &&
            queue.allowAuthorityOverrideAfter != 0
        ) {
            // check that the enclave is not already verified
            if (
                enclave.verificationStatus !=
                EnclaveLib.VerificationStatus.OVERRIDE
            ) {
                revert ErrorLib.InvalidStatus(
                    enclaveId,
                    uint256(enclave.verificationStatus),
                    uint256(EnclaveLib.VerificationStatus.OVERRIDE)
                );
            }

            // check that the enclave is not already expired
            if (enclave.validUntil < block.timestamp) {
                revert ErrorLib.EnclaveExpired(enclaveId);
            }
        } else {
            // just verify that enclave is still valid otherwise
            if (!isEnclaveValid(enclaveId)) {
                revert ErrorLib.InvalidEnclave(enclaveId);
            }
        }

        AttestationQueueLib.setLastHeartbeat(enclave.queueId);
        EnclaveLib.setLastHeartbeat(enclaveId);

        // heartbeat onto queue
        if (!enclave.isOnQueue) {
            EnclaveLib.setIsOnQueue(enclaveId, true);
            AttestationQueueLib.push(enclave.queueId, enclaveId);
        }

        // do ordinary gc
        uint256 gcIdx = queue.gcIdx;
        address gcEnclaveId = queue.data[gcIdx];

        // increment gcIdx
        AttestationQueueLib.incrementGC(enclave.queueId);

        // handle expired enclaves if gcIdx is expired
        if (
            (EnclaveLib.enclaves(gcEnclaveId).lastHeartbeat +
                queue.enclaveTimeout) < block.timestamp
        ) {
            // emit enclave gc event
            emit EnclaveGC(gcEnclaveId, enclave.queueId);
            EnclaveLib.setIsOnQueue(gcEnclaveId, false);

            // swap remove the gcIdx element from the queue
            AttestationQueueLib.swapRemove(enclave.queueId, gcIdx);
        }
    }

    // rotate enclave signer to new signer (only the authority can do this)
    function rotateEnclaveSigner(
        address enclaveId,
        address newSigner
    ) external guarded(GuardType.ALLOWED) {
        address msgSender = getMsgSender();
        EnclaveLib.Enclave memory enclave = EnclaveLib.enclaves(enclaveId);
        if (msgSender != enclave.authority) {
            revert ErrorLib.InvalidAuthority(enclave.authority, msgSender);
        }

        // set enclave to failed validity so it can't be used, but still exists / is on queue
        EnclaveLib.setEnclaveConfig(
            enclaveId,
            newSigner,
            enclave.authority,
            enclave.queueId
        );
        emit EnclaveRotateSigner(enclaveId, enclave.signer, newSigner);
    }

    /***
     * view functions below
     * enclaves - get a enclave by id
     * enclaveSignerToEnclaveAddress - get a enclave address by signer
     * validate - validate a enclave for a given signer
     * isEnclaveValid - check if a enclave is valid
     */

    function enclaves(
        address enclaveId
    ) external view returns (EnclaveLib.Enclave memory) {
        return EnclaveLib.enclaves(enclaveId);
    }

    function enclaveSignerToEnclaveId(
        address signer
    ) external view returns (address) {
        return EnclaveLib.enclaveSignerToEnclaveId(signer);
    }

    // Validate a Enclave for a given signer
    // Will fail if signer has enclave and it is not valid
    function validate(
        address signer, // enclave signer address
        address attestationQueueId, // attestation queue address
        bytes32[] memory validMeasurements // tolerated enclave measurements
    ) external view {
        // Get enclave address from signer
        address enclaveId = EnclaveLib.enclaveSignerToEnclaveId(signer);

        EnclaveLib.Enclave memory enclave = EnclaveLib.enclaves(enclaveId);

        if (enclave.queueId == address(0)) {
            revert ErrorLib.EnclaveNotOnQueue(enclave.queueId, enclaveId);
        }

        if (enclave.signer != signer) {
            revert ErrorLib.InvalidSigner(enclave.signer, signer);
        }

        // check that the enclave is on the correct queue
        if (enclave.queueId != attestationQueueId) {
            revert ErrorLib.QueuesDoNotMatch(
                attestationQueueId,
                enclave.queueId
            );
        }

        // if the enclave measurement isn't included - it will revert
        if (!UtilLib.containsBytes32(validMeasurements, enclave.mrEnclave)) {
            revert ErrorLib.MrEnclaveNotAllowed(
                enclave.queueId,
                enclave.mrEnclave
            );
        }

        // check that the enclave is not already expired
        if (enclave.validUntil < block.timestamp) {
            revert ErrorLib.EnclaveExpired(enclaveId);
        }

        // Ensure that the enclave is verified
        if (
            enclave.verificationStatus !=
            EnclaveLib.VerificationStatus.SUCCESS &&
            enclave.verificationStatus != EnclaveLib.VerificationStatus.OVERRIDE
        ) {
            revert ErrorLib.EnclaveUnverified(enclaveId);
        }
    }

    // Check if a enclave is valid and has been veiried
    function isEnclaveValid(address enclaveId) public view returns (bool) {
        // get enclave
        EnclaveLib.Enclave memory enclave = EnclaveLib.enclaves(enclaveId);
        AttestationQueueLib.AttestationQueue memory queue = AttestationQueueLib
            .attestationQueues(enclave.queueId);
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
