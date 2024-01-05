//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {FunctionLib} from "../sbFunction/FunctionLib.sol";
import {RequestLib} from "../request/RequestLib.sol";
import {RoutineLib} from "../routine/RoutineLib.sol";
import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";
import {EnclaveLib} from "../enclave/EnclaveLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {PermissionLib} from "../permission/PermissionLib.sol";
import {UtilLib} from "../util/UtilLib.sol";
import {Recipient} from "../util/Recipient.sol";
import {CallVerifyLib} from "../callVerify/CallVerifyLib.sol";
import {FunctionVerifyLib} from "./FunctionVerifyLib.sol";
import {FunctionSettingsLib} from "../functionSettings/FunctionSettingsLib.sol";

contract FunctionVerify is Recipient {
    // Event emitted upon failed function call
    event VerifyFailed(
        address indexed functionId,
        address indexed callId,
        uint256 indexed code
    );

    /**
     * Verify Function Result + Run function output transactions
     * @param params FunctionVerifyParams - params for verifying function result
     */
    function verifyFunctionResult(
        FunctionVerifyLib.FunctionVerifyParams memory params
    ) external guarded(GuardType.ALLOWED) {
        uint256 startGas = gasleft(); // for tracking gas overhead

        FunctionLib.SbFunction storage fn = FunctionLib.funcs(
            params.functionId
        );
        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(fn.queueId);
        address verifierEnclaveId = queue.data[params.enclaveIdx];
        EnclaveLib.Enclave storage verifierEnclave = EnclaveLib.enclaves(
            verifierEnclaveId
        );

        // function's enclave
        EnclaveLib.Enclave storage enclave = EnclaveLib.enclaves(fn.enclaveId);

        //=====================================================================
        // Check Verifier Authority / Validity
        //=====================================================================

        // check that the encoded sender is the signer for the verifier enclave
        if (verifierEnclave.signer != getMsgSender()) {
            revert ErrorLib.InvalidAuthority(
                verifierEnclave.signer,
                getMsgSender()
            );
        }

        // check that queues are what they should be and verifier enclave is valid
        _enforceFunctionVerifierValidity(
            fn,
            queue,
            verifierEnclave,
            verifierEnclaveId
        );

        //=====================================================================
        // Validate enclave measurements
        //=====================================================================

        // add enclave measurement if this is the first run
        if (enclave.mrEnclave == bytes32(0)) {
            FunctionLib.addMrEnclaveToFunction(fn.enclaveId, params.mrEnclave);
        }

        // check that enclave measurements match if this is a second run
        if (
            enclave.mrEnclave != bytes32(0) &&
            !FunctionLib.isMrEnclaveAllowedForFunction(
                params.functionId,
                params.mrEnclave
            )
        ) {
            revert ErrorLib.FunctionMrEnclaveMismatch(
                enclave.mrEnclave,
                params.mrEnclave
            );
        }

        //=====================================================================
        // Validate observed time in the enclave is within some tolerance
        //=====================================================================
        _enforceToleratedTimestampDiscrepancy(params.observedTime);

        //=====================================================================
        // Permissions Checking
        //=====================================================================
        _enforceFunctionUsagePermissions(params, fn, queue);

        //=====================================================================
        // Mark SUCCESS in the function's enclave
        //=====================================================================
        enclave.verificationStatus = EnclaveLib.VerificationStatus.SUCCESS;
        enclave.verificationTimestamp = block.timestamp;
        enclave.validUntil = block.timestamp + 604_800;
        enclave.mrEnclave = params.mrEnclave;

        //=====================================================================
        // Set function status to ACTIVE and update timestamps + enclave idx
        //=====================================================================
        fn.state.queueIdx = (fn.state.queueIdx + 1) % queue.data.length;
        fn.state.lastExecutionTimestamp = block.timestamp;
        fn.state.nextAllowedTimestamp = params.nextAllowedTimestamp;
        fn.status = FunctionLib.FunctionStatus.ACTIVE;
        fn.state.consecutiveFailures = 0;

        //=====================================================================
        // Run functions and payout gas cost + reward and return gas costs
        //=====================================================================
        uint256[] memory costs = FunctionVerifyLib.runTransactions(
            fn,
            params,
            queue.reward,
            startGas - gasleft() // might want to make this a constant
        );

        //=====================================================================
        // Handle all function calls - scheduled and triggered
        //=====================================================================
        if (params.ids.length > 0) {
            // verify checksums for all function calls
            CallVerifyLib.verify(params.ids, params.checksums);

            // IMPORTANT: This function expects transactions[i] to correspond to
            // ids[i] and checksums[i] and codes[i] and signatures[i]
            handleCalls(params, queue, verifierEnclave.authority, costs);
        }
    }

    function failFunctionResult(
        FunctionVerifyLib.FunctionFailParams memory params
    ) external guarded(GuardType.ALLOWED) {
        uint256 startGas = gasleft(); // for tracking gas overhead
        FunctionLib.SbFunction storage fn = FunctionLib.funcs(
            params.functionId
        );
        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(fn.queueId);
        address verifierEnclaveId = queue.data[params.enclaveIdx];
        EnclaveLib.Enclave storage verifierEnclave = EnclaveLib.enclaves(
            verifierEnclaveId
        );

        //=====================================================================
        // Check Verifier Authority / Validity
        //=====================================================================

        // check that the encoded sender is the signer for the verifier enclave
        if (verifierEnclave.signer != getMsgSender()) {
            revert ErrorLib.InvalidAuthority(
                verifierEnclave.signer,
                getMsgSender()
            );
        }

        // check that queues are what they should be and verifier enclave is valid
        _enforceFunctionVerifierValidity(
            fn,
            queue,
            verifierEnclave,
            verifierEnclaveId
        );

        //=====================================================================
        // Validate observed time in the enclave is within some tolerance
        //=====================================================================
        _enforceToleratedTimestampDiscrepancy(params.observedTime);

        //=====================================================================
        // Permissions Checking for Function
        //=====================================================================
        if (
            queue.requireUsagePermissions &&
            !PermissionLib.hasPermission(
                fn.queueId,
                params.functionId,
                PermissionLib.getPermissionCode(PermissionLib.Permission.USAGE)
            )
        ) {
            fn.status = FunctionLib.FunctionStatus.INVALID_PERMISSIONS;
        }

        //=====================================================================
        // Mark FAILED in the function's enclave
        //=====================================================================
        EnclaveLib.Enclave storage enclave = EnclaveLib.enclaves(fn.enclaveId);
        enclave.verificationStatus = EnclaveLib.VerificationStatus.FAILURE;

        //=====================================================================
        // Set status to NON_EXECUTABLE if needed and update enclave idx
        //=====================================================================

        fn.state.queueIdx = (fn.state.queueIdx + 1) % queue.data.length;
        fn.state.consecutiveFailures += 1;

        // get gas overhead
        uint256 gasSpend = startGas - gasleft();

        // upper limit for manipulable gas spend to limit rebate
        if (gasSpend > 5_500_000) {
            revert ErrorLib.ExcessiveGasSpent(5_500_000, gasSpend);
        }

        //=====================================================================
        // Handle individual call failures
        //=====================================================================
        if (params.ids.length > 0) {
            // handle failures
            handleCallFailures(
                params,
                queue,
                verifierEnclave.authority,
                gasSpend
            );
        }
    }

    // IMPORTANT: This function expects transactions[i] to correspond to
    // ids[i] and checksums[i] and codes[i] and signatures[i]
    function handleCalls(
        FunctionVerifyLib.FunctionVerifyParams memory params,
        AttestationQueueLib.AttestationQueue storage queue,
        address rewardReceiver,
        uint256[] memory costs
    ) internal {
        // FunctionLib.SbFunction storage fn = FunctionLib.funcs(
        //     params.functionId
        // );

        // get request diamond
        RequestLib.DiamondStorage storage requestDiamond = RequestLib
            .diamondStorage();

        // get routine diamond
        RoutineLib.DiamondStorage storage routineDiamond = RoutineLib
            .diamondStorage();

        // grab function call settings
        FunctionSettingsLib.FunctionSettings
            storage settings = FunctionSettingsLib.functionSettings(
                params.functionId
            );

        // if resolved_ids.length < transactions.length, then split the cost evenly
        uint256 totalCost = 0;
        for (uint256 i = 0; i < costs.length; i++) {
            totalCost += costs[i];
        }
        // get cost per call
        uint256 avgCost = totalCost / params.ids.length;

        //=================================================================
        // Handle all requests and routines
        //=================================================================
        for (uint256 i = 0; i < params.ids.length; i++) {
            uint256 cost = costs.length == params.ids.length
                ? costs[i]
                : avgCost;

            // get function call (to check if it is one)
            RequestLib.Request storage fc = requestDiamond.requests[
                params.ids[i]
            ];

            // enforce max gas cost for this call
            if (
                settings.maxGasCost != 0 &&
                settings.maxGasCost * tx.gasprice + queue.reward > cost
            ) {
                // check if the gas cost is greater than the max gas cost
                revert ErrorLib.CallExceededMaxGasCost(
                    params.ids[i],
                    settings.maxGasCost,
                    cost
                );
            }

            //=============================================================
            // function requests
            //=============================================================
            if (fc.authority != address(0)) {
                // ensure that call belongs to this function
                if (fc.functionId != params.functionId) {
                    revert ErrorLib.IncorrectFunctionId(
                        params.functionId,
                        params.ids[i]
                    );
                }

                uint256 costAndFee = cost + settings.requestFee;

                // check balance
                if (fc.balance < costAndFee) {
                    revert ErrorLib.InsufficientCallBalance(
                        params.ids[i],
                        costAndFee,
                        fc.balance
                    );
                }

                // mark call as executed
                fc.errorCode = 0;
                fc.executed = true;
                fc.executedAt = block.timestamp;
                fc.balance -= costAndFee;
                fc.consecutiveFailures = 0;

                // Reward the verifier for the successful execution
                payable(rewardReceiver).transfer(costAndFee);

                // Pay request fee to the function authority
                // TODO: Why are we paying out the function authority whatever cost here?
                // Answer: I thought that requestFee was how we were going to allow function creators to get paid for their work
                // ^ if they were writing a public utility function that is
                // if (settings.requestFee > 0) {
                //     payable(fn.authority).transfer(settings.requestFee);
                // }

                //=============================================================
                // function routines
                //=============================================================
            } else {
                RoutineLib.Routine storage sc = routineDiamond.routines[
                    params.ids[i]
                ];

                // ensure that calls belong to this function
                if (sc.functionId != params.functionId) {
                    revert ErrorLib.IncorrectFunctionId(
                        params.functionId,
                        params.ids[i]
                    );
                }

                uint256 costAndFee = cost + settings.routineFee;

                // check that the fee paid is at least the cost of the call
                if (sc.balance < costAndFee) {
                    revert ErrorLib.InsufficientCallBalance(
                        params.ids[i],
                        costAndFee,
                        sc.balance
                    );
                }

                // if routine failed, increment consecutive failures or mark as non_executable
                // check that the function has enough balance to pay for the gas cost of next run
                // sets status to OUT_OF_FUNDS if not enough balance afterwards
                RoutineLib.withdrawFunds(params.ids[i], costAndFee);

                // Reward the verifier for the successful execution
                payable(rewardReceiver).transfer(costAndFee);

                // Pay routine fee to the function authority
                // if (settings.routineFee > 0) {
                //     // transfer routine fee to the function
                //     //  TODO: Why are we paying the function authority here?????
                //
                //  //  Answer: I thought that the purpose of routineFee was to allow function creators to get paid for their work
                //     payable(fn.authority).transfer(settings.routineFee);
                // }

                // mark routine as active
                sc.errorCode = 0;
                sc.status = FunctionLib.FunctionStatus.ACTIVE;
                sc.lastCalledAt = block.timestamp;
                sc.consecutiveFailures = 0;
            }
        }
    }

    function handleCallFailures(
        FunctionVerifyLib.FunctionFailParams memory params,
        AttestationQueueLib.AttestationQueue storage queue,
        address rewardReceiver,
        uint256 gasSpend
    ) internal {
        // get request diamond
        RequestLib.DiamondStorage storage requestDiamond = RequestLib
            .diamondStorage();

        // get routine diamond
        RoutineLib.DiamondStorage storage routineDiamond = RoutineLib
            .diamondStorage();

        // grab tolerated failures - this is the max number of consecutive failures and relevant to routines
        uint256 maxConsecutiveFailures = queue.maxConsecutiveFunctionFailures;

        //=================================================================
        // Handle all function calls - scheduled and triggered
        //=================================================================
        for (uint256 i = 0; i < params.ids.length; i++) {
            uint256 startGas = gasleft(); // for tracking gas overhead

            // get function call
            RequestLib.Request storage fc = requestDiamond.requests[
                params.ids[i]
            ];

            //=============================================================
            // function calls
            //=============================================================
            if (fc.authority != address(0)) {
                // ensure that call belongs to this function
                if (fc.functionId != params.functionId) {
                    revert ErrorLib.IncorrectFunctionId(
                        params.functionId,
                        params.ids[i]
                    );
                }

                // increment consecutive failures so we can handle non-executable functions if they pass the queue threshold
                if (params.codes[i] > 0) {
                    fc.consecutiveFailures += 1;
                } else {
                    fc.consecutiveFailures = 0;
                }

                // handle case where we should mark executed
                // code > 0 is a failed run (no execution)
                // code == 2 is a run that failed due to lack of funds - so we can mark as executed

                // set the errorCode
                fc.errorCode = params.codes[i];

                // check if this run failed due to lack of funds
                if (params.codes[i] == 202) {
                    // mark call as executed - to prevent it from being pulled / run
                    fc.status = FunctionLib.FunctionStatus.OUT_OF_FUNDS;
                }

                // if we've hit the max consecutive failures, mark as executed (we won't run it again)
                // if (
                    // fc.consecutiveFailures ==
                    // queue.maxConsecutiveFunctionFailures
                // ) {
                    // fc.status = FunctionLib.FunctionStatus.NON_EXECUTABLE;
                // }

                // emit the failure
                emit VerifyFailed(
                    params.functionId,
                    params.ids[i],
                    params.codes[i]
                );

                uint256 owed = (gasSpend + startGas - gasleft()) *
                    tx.gasprice +
                    queue.reward;

                // how we handle broke calls is an open question
                // - IMO simulate and ignore ones with low funds
                if (fc.balance < owed) {
                    fc.status = FunctionLib.FunctionStatus.OUT_OF_FUNDS;
                    fc.executed = true;
                    payable(rewardReceiver).transfer(fc.balance);
                    fc.balance = 0;
                } else {
                    // withdraw from the call
                    fc.balance -= owed;
                    payable(rewardReceiver).transfer(owed);
                }

                //=============================================================
                // function routines
                //=============================================================
            } else {
                RoutineLib.Routine storage sc = routineDiamond.routines[
                    params.ids[i]
                ];

                // ensure that calls belong to this function
                if (sc.functionId != params.functionId) {
                    revert ErrorLib.IncorrectFunctionId(
                        params.functionId,
                        params.ids[i]
                    );
                }

                // set the errorCode
                sc.errorCode = params.codes[i];

                // increment consecutive failures so we can handle non-executable functions if they pass the queue threshold
                if (params.codes[i] > 0) {
                    sc.consecutiveFailures += 1;
                } else {
                    sc.consecutiveFailures = 0;
                }

                // if the call failed due to lack of funds, mark as executed
                if (params.codes[i] == 202) {
                    sc.status = FunctionLib.FunctionStatus.OUT_OF_FUNDS;
                }

                // if we've hit the max consecutive failures, mark as non-executable
                // if (sc.consecutiveFailures >= maxConsecutiveFailures) {
                    // sc.status = FunctionLib.FunctionStatus.NON_EXECUTABLE;
                // }

                // get the gas cost + reward for the verifier
                uint256 owed = (gasSpend + startGas - gasleft()) *
                    tx.gasprice +
                    queue.reward;

                // transfer gas cost + reward to the function (this includes the cost of the call)
                if (owed > sc.balance) {
                    owed = sc.balance;
                }

                RoutineLib.withdrawFunds(params.ids[i], owed);

                // Reward the verifier for the gas spent + marking the failure
                payable(rewardReceiver).transfer(owed);

                // emit the failure
                emit VerifyFailed(
                    params.functionId,
                    params.ids[i],
                    params.codes[i]
                );
            }
        }
    }

    function _enforceToleratedTimestampDiscrepancy(
        uint256 observedTime
    ) internal view {
        // Check enclave time is within N seconds of observed time
        uint256 timestamp_diff = UtilLib.abs(
            int256(block.timestamp) - int256(observedTime)
        );
        uint256 toleratedTimestampDiscrepancy = FunctionLib
            .getToleratedTimestampDiscrepancy();
        if (timestamp_diff > toleratedTimestampDiscrepancy) {
            revert ErrorLib.IncorrectReportedTime(
                block.timestamp + toleratedTimestampDiscrepancy,
                observedTime
            );
        }
    }

    function _enforceFunctionUsagePermissions(
        FunctionVerifyLib.FunctionVerifyParams memory params,
        FunctionLib.SbFunction storage fn,
        AttestationQueueLib.AttestationQueue storage queue
    ) internal view {
        if (
            queue.requireUsagePermissions &&
            !PermissionLib.hasPermission(
                fn.queueId,
                params.functionId,
                PermissionLib.getPermissionCode(PermissionLib.Permission.USAGE)
            )
        ) {
            revert ErrorLib.PermissionDenied(
                fn.queueId,
                params.functionId,
                PermissionLib.getPermissionCode(PermissionLib.Permission.USAGE)
            );
        }
    }

    function _enforceFunctionVerifierValidity(
        FunctionLib.SbFunction storage fn,
        AttestationQueueLib.AttestationQueue storage queue,
        EnclaveLib.Enclave storage verifierEnclave,
        address verifierEnclaveId
    ) internal view {
        // validate the verifier's enclave status
        if (
            !EnclaveLib.isEnclaveValid(
                verifierEnclaveId,
                verifierEnclave,
                queue
            )
        ) {
            revert ErrorLib.InvalidEnclave(verifierEnclaveId);
        }

        // check that function queue is the same as the verifier's
        if (fn.queueId != verifierEnclave.queueId) {
            revert ErrorLib.QueuesDoNotMatch(
                fn.queueId,
                verifierEnclave.queueId
            );
        }
    }
}
