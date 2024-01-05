//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {OracleLib} from "./OracleLib.sol";
import {OracleQueueLib} from "../oracleQueue/OracleQueueLib.sol";
import {PermissionLib} from "../permission/PermissionLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {UtilLib} from "../util/UtilLib.sol";
import {Enclave} from "../enclave/Enclave.sol";
import {Recipient} from "../util/Recipient.sol";

contract Oracle is Recipient {
    event OracleAccountInit(address indexed signer, address indexed accountId);
    event OracleGC(address indexed oracleId, address indexed queueId);
    event OracleHeartbeat(address indexed oracleId);
    event OracleSetConfig(
        address indexed oracleId,
        string name,
        address indexed signer,
        address indexed queueId,
        address authority
    );
    event OracleRotateSigner(
        address indexed queueId,
        address indexed oldSigner,
        address indexed newSigner
    );

    function createOracle(
        string calldata name,
        address signer,
        address queueId,
        address authority
    ) external {
        address accountId = UtilLib.generateId();

        // @NOTE: This function is guarded by the downstream call to createOracleWithId
        // which requires an oracle to be listed as "allowed"
        createOracleWithId(accountId, name, signer, queueId, authority);
    }

    function createOracleWithId(
        address oracleId,
        string calldata name,
        address signer,
        address queueId,
        address authority
    ) public guarded(GuardType.ALLOWED) {
        if (OracleLib.oracleExists(oracleId)) {
            revert ErrorLib.OracleAlreadyExists(oracleId);
        }
        OracleLib.setOracleConfig(oracleId, name, signer, queueId, authority);
        emit OracleAccountInit(signer, oracleId);
    }

    // used in v3 oracle migration
    function rotateOracleSigner(
        address oracleId,
        address newSigner
    ) external guarded(GuardType.ALLOWED) {
        OracleLib.Oracle storage oracle = OracleLib.oracles(oracleId);
        address msgSender = getMsgSender();
        if (oracle.authority != msgSender) {
            revert ErrorLib.InvalidAuthority(oracle.authority, msgSender);
        }
        oracle.signer = newSigner;
    }

    // Heartbeat onto a queue, crank oracle gc
    // not guarded by reentrancy guard because it's called on save result
    function oracleHeartbeat(
        address oracleId
    ) external guarded(GuardType.ALLOWED) {
        OracleLib.Oracle storage oracle = OracleLib.oracles(oracleId);
        OracleQueueLib.OracleQueue storage queue = OracleQueueLib.oracleQueues(
            oracle.queueId
        );
        OracleQueueLib.AttestationConfig
            storage attestationConfig = OracleQueueLib.queueAttestationConfigs(
                oracle.queueId
            );

        bool hasHeartbeatPermission = PermissionLib.hasPermission(
            oracle.queueId,
            oracleId,
            PermissionLib.getPermissionCode(PermissionLib.Permission.HEARTBEAT)
        );

        // if forwarded tx this will be the original sender
        address msgSender = getMsgSender();

        if (msgSender != oracle.signer) {
            revert ErrorLib.InvalidSigner(oracle.signer, msgSender);
        }

        if (attestationConfig.requireValidEnclave) {
            // If queue is v3 enabled, validate enclave and node's ability to service this queue
            // this will revert if the enclave is invalid, if the queue doesn't match, or if the enclave measurement is not allowed
            Enclave(address(this)).validate(
                msgSender,
                attestationConfig.attestationQueueId,
                attestationConfig.mrEnclaves
            );

            if (
                attestationConfig.requireHeartbeatPermission &&
                !hasHeartbeatPermission
            ) {
                revert ErrorLib.PermissionDenied(
                    oracle.queueId,
                    oracleId,
                    PermissionLib.getPermissionCode(
                        PermissionLib.Permission.HEARTBEAT
                    )
                );
            }
        } else if (!hasHeartbeatPermission) {
            revert ErrorLib.PermissionDenied(
                oracle.queueId,
                oracleId,
                PermissionLib.getPermissionCode(
                    PermissionLib.Permission.HEARTBEAT
                )
            );
        }

        // update heartbeat time
        OracleLib.updateLastHeartbeat(oracleId);

        // heartbeat onto queue
        if (oracle.numRows == 0) {
            OracleLib.setNumRows(oracleId, 1);
            OracleQueueLib.push(oracle.queueId, oracleId);
        }

        // get gcIdx - guaranteed to have at least 1 element here
        uint256 gcIdx = queue.gcIdx;
        address gcOracleId = queue.oracles[gcIdx];

        // increment gcIdx
        OracleQueueLib.incrementGC(oracle.queueId);

        // handle expired oracles if gcIdx is expired
        if (
            (OracleLib.oracles(gcOracleId).lastHeartbeat +
                queue.oracleTimeout) < block.timestamp
        ) {
            // log the garbage collection
            emit OracleGC(gcOracleId, oracle.queueId);

            // swap remove queue.oracles[gcIdx]
            OracleLib.setNumRows(gcOracleId, 0);
            OracleQueueLib.swapRemove(oracle.queueId, gcIdx);
        }

        emit OracleHeartbeat(oracleId);
    }

    function oracleGarbageCollect(
        address oracleId,
        uint256 oracleIdx
    ) external guarded(GuardType.PUBLIC) {
        OracleLib.Oracle storage oracle = OracleLib.oracles(oracleId);
        OracleQueueLib.OracleQueue storage queue = OracleQueueLib.oracleQueues(
            oracle.queueId
        );

        if (oracle.numRows == 0) {
            revert ErrorLib.OracleNotOnQueue(oracle.queueId, oracleId);
        }

        if (queue.oracles[oracleIdx] != oracleId) {
            revert ErrorLib.OracleNotAtQueueIdx(
                oracle.queueId,
                oracleId,
                oracleIdx
            );
        }

        // oracle signer can remove the oracle at any time
        if (
            oracle.signer == msg.sender ||
            OracleLib.oracles(oracleId).lastHeartbeat + queue.oracleTimeout <
            block.timestamp
        ) {
            // log the garbage collection
            emit OracleGC(oracleId, oracle.queueId);
            uint256 gcIdx = uint256(oracleIdx);
            OracleLib.setNumRows(oracleId, 0);
            OracleQueueLib.swapRemove(oracle.queueId, gcIdx);
        }
    }

    function setOracleConfig(
        address oracleId,
        string calldata name,
        address signer,
        address queueId,
        address authority
    ) external guarded(GuardType.ALLOWED) {
        OracleLib.Oracle memory oracle = OracleLib.oracles(oracleId);
        if (msg.sender != oracle.signer) {
            revert ErrorLib.InvalidSigner(oracle.signer, msg.sender);
        }

        // require oracle to be off of the queue before messing with settings
        if (oracle.numRows != 0) {
            revert ErrorLib.InvalidArgument(1);
        }
        OracleLib.setOracleConfig(oracleId, name, signer, queueId, authority);
        emit OracleSetConfig(oracleId, name, signer, queueId, authority);
    }

    // * view functions below
    // oracles - fetch oracle data
    function oracles(
        address oracleId
    ) external view returns (OracleLib.Oracle memory) {
        return OracleLib.oracles(oracleId);
    }
}
