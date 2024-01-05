//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {FunctionLib} from "./FunctionLib.sol";
import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";
import {EnclaveLib} from "../enclave/EnclaveLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {PermissionLib} from "../permission/PermissionLib.sol";
import {TransactionLib} from "../transaction/TransactionLib.sol";
import {UtilLib} from "../util/UtilLib.sol";
import {Admin} from "../admin/Admin.sol";
import {Enclave} from "../enclave/Enclave.sol";
import {Recipient} from "../util/Recipient.sol";

contract SbFunction is Recipient {
    event FunctionFund(
        address indexed functionId,
        address indexed funder,
        uint256 indexed amount
    );
    event FunctionWithdraw(
        address indexed functionId,
        address indexed withdrawer,
        uint256 indexed amount
    );
    event FunctionAccountInit(
        address indexed authority,
        address indexed accountId
    );

    // Create a function at a particular ID
    // @NOTE - this function is guarded by downstream createEnclaveWithId call
    // which is guarded with a reentrancy guard
    function createFunctionWithId(
        address functionId,
        string memory name,
        address authority,
        address queueId,
        string memory containerRegistry,
        string memory container,
        string memory version,
        string memory schedule,
        string memory paramsSchema,
        address[] memory permittedCallers
    ) public payable {
        if (FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionAlreadyExists(functionId);
        }

        // Set function creation metadata
        FunctionLib.setCreatedAt(functionId, block.timestamp);

        // create enclave
        // @NOTE: Guarded with `guarded(GuardType.PUBLIC)` in Enclave
        address enclaveId = functionId;
        Enclave(address(this)).createEnclaveWithId(
            enclaveId,
            address(0),
            queueId,
            authority
        );

        // get queue to set queueIdx to currIdx + 1
        {
            AttestationQueueLib.AttestationQueue
                memory queue = AttestationQueueLib.attestationQueues(queueId);
            if (queue.data.length != 0) {
                FunctionLib.setQueueIdx(
                    functionId,
                    (queue.currIdx + 1) % queue.data.length
                );
            }
        }

        // create function
        FunctionLib.setFunctionData(
            functionId,
            name,
            authority,
            enclaveId,
            queueId
        );

        FunctionLib.setFunctionConfig(
            functionId,
            containerRegistry,
            container,
            version,
            schedule,
            paramsSchema,
            permittedCallers
        );

        FunctionLib.pushFunctionId(functionId);
        FunctionLib.escrowFund(functionId, msg.value);
        emit FunctionAccountInit(authority, functionId);
    }

    // Create a Function at a generated ID
    // @NOTE - this function is guarded by downstream createEnclaveWithId call
    // which is guarded with a reentrancy guard
    function createFunction(
        string memory name,
        address authority,
        address queueId,
        string memory containerRegistry,
        string memory container,
        string memory version,
        string memory schedule,
        string memory paramsSchema,
        address[] memory permittedCallers
    ) external payable {
        // @NOTE: Guarded with `guarded(GuardType.PUBLIC)` in Enclave
        address functionId = UtilLib.generateId();
        createFunctionWithId(
            functionId,
            name,
            authority,
            queueId,
            containerRegistry,
            container,
            version,
            schedule,
            paramsSchema,
            permittedCallers
        );
    }

    function setFunctionConfig(
        address functionId,
        string memory name,
        address authority,
        string memory containerRegistry,
        string memory container,
        string memory version,
        string memory schedule,
        string memory paramsSchema,
        address[] memory permittedCallers
    ) external guarded(GuardType.PUBLIC) {
        if (!FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionDoesNotExist(functionId);
        }

        FunctionLib.SbFunction storage fn = FunctionLib.funcs(functionId);

        if (msg.sender != fn.authority) {
            revert ErrorLib.InvalidAuthority(fn.authority, msg.sender);
        }

        // create function
        FunctionLib.setFunctionData(
            functionId,
            name,
            authority,
            fn.enclaveId,
            fn.queueId
        );

        FunctionLib.setFunctionConfig(
            functionId,
            containerRegistry,
            container,
            version,
            schedule,
            paramsSchema,
            permittedCallers
        );

        // wipe function state
        FunctionLib.setTriggeredSince(functionId, 0);
        FunctionLib.setTriggeredCount(functionId, 0);
        FunctionLib.setConsecutiveFailures(functionId, 0);

        // wipe enclave data
        EnclaveLib.setEnclaveMeasurementAndSuccess(fn.enclaveId, bytes32(0), 0);
        EnclaveLib.setSignerToEnclaveId(address(0), fn.enclaveId);

        // set status to failure (default)
        EnclaveLib.setEnclaveVerficationStatus(
            fn.enclaveId,
            EnclaveLib.VerificationStatus.FAILURE
        );
    }

    // Function to fund funcs
    function functionEscrowFund(
        address accountId
    ) external payable guarded(GuardType.PUBLIC) {
        if (!FunctionLib.functionExists(accountId)) {
            revert ErrorLib.FunctionDoesNotExist(accountId);
        }
        FunctionLib.escrowFund(accountId, msg.value);
        emit FunctionFund(accountId, msg.sender, msg.value);
    }

    // Function to withdraw funds from function lease
    function functionEscrowWithdraw(
        address payable recipient,
        address functionId,
        uint256 amount
    ) external guarded(GuardType.PUBLIC) {
        FunctionLib.SbFunction memory fn = FunctionLib.funcs(functionId);
        if (fn.authority != msg.sender) {
            revert ErrorLib.InvalidAuthority(fn.authority, msg.sender);
        } else if (fn.balance < amount) {
            revert ErrorLib.InsufficientBalance(amount, fn.balance);
        }
        FunctionLib.escrowWithdraw(functionId, amount);
        recipient.transfer(amount);
        emit FunctionWithdraw(functionId, recipient, amount);
    }

    // This function resolves scheduled function runs (triggered by cron schedule)
    function functionVerify(
        uint256 enclaveIdx, // verifier enclave idx
        address functionId,
        address delegatedSignerAddress,
        uint256 observedTime,
        uint256 nextAllowedTimestamp,
        bool isFailure,
        bytes32 mrEnclave,
        TransactionLib.Transaction[] memory transactions,
        bytes[] memory signatures
    ) external guarded(GuardType.ALLOWED) {
        _functionVerify(
            enclaveIdx,
            functionId,
            delegatedSignerAddress,
            observedTime,
            nextAllowedTimestamp,
            isFailure,
            mrEnclave,
            transactions,
            signatures
        );
    }

    // DEPRECATED FUNCTION
    // This function resolves individual function calls triggered on-chain
    // @NOTE - this function is guarded and downstream calls cannot reenter the switchboard program
    function functionVerifyRequest(
        uint256 enclaveIdx,
        address functionId,
        address delegatedSignerAddress,
        uint256 observedTime,
        uint256 nextAllowedTimestamp,
        bool isFailure,
        bytes32 mrEnclave,
        TransactionLib.Transaction[] memory transactions,
        bytes[] memory signatures,
        address[] memory functionCallIds // List of function calls resolved by this run.
    ) external guarded(GuardType.ALLOWED) {}

    // DEPRECATED FUNCTION
    // Verify a function
    function _functionVerify(
        uint256 enclaveIdx, // verifier enclave idx
        address functionId,
        address delegatedSignerAddress,
        uint256 observedTime,
        uint256 nextAllowedTimestamp,
        bool isFailure,
        bytes32 mrEnclave,
        TransactionLib.Transaction[] memory transactions,
        bytes[] memory signatures
    ) internal {}

    // DEPRECATED FUNCTION
    // Run Functions and Payout Gas Cost + Reward
    function runTransactions(
        address functionId,
        uint256 reward,
        TransactionLib.Transaction[] memory transactions,
        bytes[] memory signatures,
        address verifierOwner
    ) internal {}

    // can call into other functions on the diamond - used for atomic transactions on the node side
    // AUDIT NOTE: This one should be permitted to re-enter some functions, but it could be the source of problems.
    function forward(
        TransactionLib.Transaction[] memory transactions,
        bytes[] memory signatures
    ) external payable guarded(GuardType.FORWARDER) {
        // Just run the functions and verify the signatures
        for (uint256 i = 0; i < transactions.length; i++) {
            TransactionLib.Transaction memory transaction = transactions[i];

            // get eip712 hash of the transaction struct
            bytes32 txHash = TransactionLib.getTransactionHash(transaction);

            // check if tx hash has already been executed, if not, set it to executed
            if (TransactionLib.isTxHashAlreadyExecuted(txHash)) {
                revert ErrorLib.AlreadyExecuted(txHash);
            } else {
                TransactionLib.setTxHashToExecuted(txHash);
            }

            // check that the signature for the current tx is valid
            bool isValidSignature = TransactionLib.isValidTransactionSignature(
                transaction.from,
                txHash,
                signatures[i]
            );

            if (!isValidSignature) {
                revert ErrorLib.InvalidSignature(
                    transaction.from,
                    txHash,
                    signatures[i]
                );
            }

            if (block.timestamp > transaction.expirationTimeSeconds) {
                revert ErrorLib.TransactionExpired(
                    transaction.expirationTimeSeconds
                );
            }

            // EIP2771: call the function with the encoded data and the from address
            // only allow function calls to switchboard
            // this function only serves to allow atomic transactions on the node side
            // and allow for gas payment to be made by the enclave/oracle operator on behalf of the
            // enclave signer
            (bool success, bytes memory returnData) = transaction.to.call{
                value: msg.value
            }(abi.encodePacked(transaction.data, transaction.from));

            // run the function - will revert on failure (important because reentrancy guard lock isn't released until run finishes)
            TransactionLib.verifyCallResultFromTarget(
                address(this),
                success,
                returnData,
                "Forwarder Call Failed"
            );
        }
    }

    // set function deactivated if queue authority
    function setFunctionDeactivated(
        address functionId
    ) external guarded(GuardType.ALLOWED) {
        FunctionLib.SbFunction storage fn = FunctionLib.funcs(functionId);
        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(fn.queueId);

        // check that the queue authority is the sender
        if (queue.authority != getMsgSender()) {
            revert ErrorLib.InvalidAuthority(queue.authority, getMsgSender());
        }

        FunctionLib.setFunctionStatus(
            functionId,
            FunctionLib.FunctionStatus.DEACTIVATED
        );
    }

    // ADMIN ONLY
    function setToleratedTimestampDiscrepancy(
        uint256 tolerance
    ) external guarded(GuardType.ADMIN) {
        if (!Admin(address(this)).isAdmin(msg.sender)) {
            revert ErrorLib.ACLNotAdmin(getMsgSender());
        }
        FunctionLib.setToleratedTimestampDiscrepancy(tolerance);
    }
}
