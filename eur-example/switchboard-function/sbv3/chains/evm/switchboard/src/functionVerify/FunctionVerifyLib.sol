//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {UtilLib} from "../util/UtilLib.sol";
import {FunctionLib} from "../sbFunction/FunctionLib.sol";
import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";
import {TransactionLib} from "../transaction/TransactionLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {RoutineLib} from "../routine/RoutineLib.sol";
import {FunctionSettingsLib} from "../functionSettings/FunctionSettingsLib.sol";

library FunctionVerifyLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.functionVerify.storage");

    struct FunctionVerifyParams {
        uint256 enclaveIdx; // verifier enclave idx
        address functionId; // function being run
        address delegatedSignerAddress; // enclave signer
        uint256 observedTime; // observed time in enclave
        uint256 nextAllowedTimestamp;
        bytes32 mrEnclave; // enclave measurement
        TransactionLib.Transaction[] transactions; // transactions to run
        bytes[] signatures; // signatures for each transaction
        //---- below are optional params / just to handle calls ----
        address[] ids; // List of function calls resolved by this run
        bytes32[] checksums; // List of params checksums for each function call
        uint8[] codes; // Failure reason for individual calls (0 if successful)
    }

    struct FunctionFailParams {
        uint256 enclaveIdx; // verifier enclave idx
        address functionId; // function being run
        uint256 observedTime; // observed time in enclave
        uint256 nextAllowedTimestamp;
        uint8 code; // reason for failure
        //---- below are optional params to handle calls ----
        address[] ids; // List of function calls resolved by this run / marked as failed
        bytes32[] checksums; // List of params checksums for each function call
        uint8[] codes; // Failure reason for individual calls
    }

    struct FunctionVerifyDetails {
        uint256 lastContainerPullTimestamp;
        string lastPulledVersion;
        string lastPulledContainer;
        string lastPulledRegistry;
    }

    struct DiamondStorage {
        mapping(address => FunctionVerifyDetails) lastContainerPullInfo;
    }

    // Run Functions and Payout Gas Cost + Reward
    function runTransactions(
        FunctionLib.SbFunction storage fn,
        FunctionVerifyParams memory params,
        uint256 reward,
        uint256 overheadGas
    ) internal returns (uint256[] memory) {
        // costs for each transaction (in wei)
        uint256[] memory costs = new uint256[](params.transactions.length);
        TransactionLib.DiamondStorage
            storage transactionDiamondStorage = TransactionLib.diamondStorage();
        FunctionSettingsLib.FunctionSettings
            storage settings = FunctionSettingsLib.functionSettings(
                params.functionId
            );

        // run each transaction
        for (uint256 i = 0; i < params.transactions.length; i++) {
            uint256 startGas = gasleft();
            TransactionLib.Transaction memory transaction = params.transactions[
                i
            ];

            // only forward successful function result runs
            if (transaction.to != address(0)) {
                // Check that tx is valid and has not been executed
                {
                    bytes32 txHash = TransactionLib.getTransactionHash(
                        transaction
                    );
                    if (
                        transactionDiamondStorage.executedTransactions[txHash]
                    ) {
                        revert ErrorLib.AlreadyExecuted(txHash);
                    } else {
                        transactionDiamondStorage.executedTransactions[
                            txHash
                        ] = true;
                    }
                }

                if (block.timestamp > transaction.expirationTimeSeconds) {
                    revert ErrorLib.TransactionExpired(
                        transaction.expirationTimeSeconds
                    );
                }

                // make sure the target is NOT the switchboard program
                // this is really important so that metatransactions cannot be crafted with arbitrary addresses
                // because functionIds (address type) can be chosen by creator
                // - though this should be caught by reentrancy guard
                if (transaction.to == address(this)) {
                    revert ErrorLib.FunctionIncorrectTarget(
                        params.functionId,
                        transaction.to
                    );
                }

                // send meta-txs
                {
                    // EIP2771: call the function with the encoded data and the from address
                    // Encode sender as function ID so users can distinguish between functions
                    (bool success, bytes memory returnData) = transaction
                        .to
                        .call{value: transaction.value}(
                        abi.encodePacked(transaction.data, params.functionId)
                    );

                    // run the function - will revert on failure (important because reentrancy guard lock isn't released until run finishes)
                    TransactionLib.verifyCallResultFromTarget(
                        transaction.to,
                        success,
                        returnData,
                        "Function Call Failed"
                    );
                }
            }

            // check gas spend didn't go over the limit
            uint256 gasSpend = startGas -
                gasleft() +
                overheadGas /
                params.transactions.length;

            // Enforce max gas cost if set
            if (settings.maxGasCost > 0 && gasSpend > settings.maxGasCost) {
                revert ErrorLib.ExcessiveGasSpent(
                    settings.maxGasCost,
                    gasSpend
                );
            }

            // check if the spend exceeded the limit
            if (gasSpend > transaction.gasLimit) {
                revert ErrorLib.GasLimitExceeded(
                    transaction.gasLimit,
                    gasSpend
                );
            }

            // This is the cost of the largest allowed bulk oracle update cost.
            // These are individual function calls, so they really should be cheaper.
            if (gasSpend > 5_500_000) {
                revert ErrorLib.ExcessiveGasSpent(5_500_000, gasSpend);
            }

            // store the latest function gas cost
            fn.state.lastExecutionGasCost = gasSpend;

            // Store the gas cost for this transaction
            costs[i] = gasSpend * tx.gasprice + reward + transaction.value;
        }

        return costs;
    }
}
