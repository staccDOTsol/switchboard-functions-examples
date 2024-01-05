//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {RoutineLib} from "./RoutineLib.sol";
import {FunctionLib} from "../sbFunction/FunctionLib.sol";
import {RequestLib} from "../request/RequestLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {UtilLib} from "../util/UtilLib.sol";
import {Recipient} from "../util/Recipient.sol";
import {FunctionSettingsLib} from "../functionSettings/FunctionSettingsLib.sol";

contract Routine is Recipient {
    event RoutineFund(
        address indexed functionId,
        address indexed funder,
        uint256 amount
    );
    event RoutineWithdraw(
        address indexed functionId,
        address indexed funder,
        uint256 amount
    );
    event RoutineCreated(
        address indexed functionId,
        address indexed sender,
        address indexed routineId,
        bytes params
    );

    function createRoutineWithId(
        address routineId,
        address functionId,
        address authority,
        bytes memory params,
        string memory schedule
    ) public payable guarded(GuardType.PUBLIC) {
        address msgSender = getMsgSender();

        if (!FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionDoesNotExist(functionId);
        }

        if (RoutineLib.routineExists(routineId)) {
            revert ErrorLib.RoutineIdAlreadyExists(routineId);
        }

        if (RequestLib.requestExists(routineId)) {
            revert ErrorLib.RequestIdAlreadyExists(routineId);
        }

        if (routineId == address(0)) {
            revert ErrorLib.InvalidRoutineId(routineId);
        }

        FunctionLib.SbFunction memory fn = FunctionLib.funcs(functionId);
        FunctionSettingsLib.FunctionSettings
            memory settings = FunctionSettingsLib.functionSettings(functionId);

        // if no permittedCallers are set, then anyone can call
        if (
            fn.config.permittedCallers.length > 0 &&
            !UtilLib.containsAddress(fn.config.permittedCallers, msgSender)
        ) {
            revert ErrorLib.FunctionCallerNotPermitted(functionId, msgSender);
        }

        if (settings.routinesDisabled) {
            revert ErrorLib.RoutinesDisabled(functionId);
        }

        if (
            settings.routinesRequireAuthorization && fn.authority != msgSender
        ) {
            revert ErrorLib.InvalidAuthority(fn.authority, msgSender);
        }

        // create the function call
        RoutineLib.setRoutine(
            routineId,
            functionId,
            authority,
            schedule,
            params
        );
        RoutineLib.pushRoutineId(routineId);

        // increment trigger count so function can tell how many calls have been made
        emit RoutineCreated(functionId, msgSender, routineId, params);

        // add sent funds to the function balance
        RoutineLib.escrowFund(routineId, msg.value);
        emit RoutineFund(functionId, msg.sender, msg.value);
    }

    function updateRoutine(
        address routineId,
        address functionId,
        address authority,
        bytes memory params,
        string memory schedule
    ) external guarded(GuardType.PUBLIC) {
        RoutineLib.Routine storage routine = RoutineLib.routines(routineId);
        if (routine.authority != msg.sender) {
            revert ErrorLib.InvalidAuthority(routine.authority, msg.sender);
        }

        if (functionId != routine.functionId) {
            if (!FunctionLib.functionExists(functionId)) {
                revert ErrorLib.FunctionDoesNotExist(functionId);
            }

            FunctionLib.SbFunction memory fn = FunctionLib.funcs(functionId);

            // if no permittedCallers are set, then anyone can call
            if (
                fn.config.permittedCallers.length > 0 &&
                !UtilLib.containsAddress(fn.config.permittedCallers, msg.sender)
            ) {
                revert ErrorLib.FunctionCallerNotPermitted(
                    functionId,
                    msg.sender
                );
            }
        }

        RoutineLib.setRoutine(
            routineId,
            functionId,
            authority,
            schedule,
            params
        );
    }

    function routineEscrowFund(
        address routineId
    ) external payable guarded(GuardType.PUBLIC) {
        if (!RoutineLib.routineExists(routineId)) {
            revert ErrorLib.RoutineIdAlreadyExists(routineId);
        }
        RoutineLib.escrowFund(routineId, msg.value);
        emit RoutineFund(routineId, msg.sender, msg.value);
    }

    function routineEscrowWithdraw(
        address routineId,
        uint256 amount
    ) external guarded(GuardType.PUBLIC) {
        RoutineLib.Routine storage routine = RoutineLib.routines(routineId);
        if (routine.authority != msg.sender) {
            revert ErrorLib.InvalidAuthority(routine.authority, msg.sender);
        }

        if (amount > routine.balance) {
            revert ErrorLib.InsufficientBalance(amount, routine.balance);
        }

        RoutineLib.escrowWithdraw(routineId, amount);
        payable(msg.sender).transfer(amount);
        emit RoutineWithdraw(routineId, msg.sender, amount);
    }

    // Check if a routine exists
    function routineExists(address routineId) external view returns (bool) {
        return RoutineLib.routineExists(routineId);
    }

    // Get the set of calls that need to be addressed with params for a particular function
    function routines(
        address routineId
    ) external view returns (RoutineLib.Routine memory) {
        RoutineLib.DiamondStorage storage fcs = RoutineLib.diamondStorage();
        RoutineLib.Routine memory fnCall = fcs.routines[routineId];
        return fnCall;
    }

    // Get the set of calls that need to be addressed with params for a particular function
    function getActiveRoutinesByQueue(
        address queueId
    ) external view returns (address[] memory, RoutineLib.Routine[] memory) {
        FunctionLib.DiamondStorage storage fs = FunctionLib.diamondStorage();
        RoutineLib.DiamondStorage storage fcs = RoutineLib.diamondStorage();

        uint256 count = 0;
        for (uint256 i = 0; i < fcs.routineIds.length; i++) {
            address addr = fcs.routineIds[i];
            RoutineLib.Routine memory routine = fcs.routines[addr];
            FunctionLib.SbFunction memory fn = fs.funcs[routine.functionId];

            bool isActive = routine.status ==
                FunctionLib.FunctionStatus.ACTIVE ||
                routine.status == FunctionLib.FunctionStatus.NONE;

            // Check that queue is the same
            // Check that function is active
            if (fn.queueId == queueId && isActive) {
                count++;
            }
        }
        address[] memory addrs = new address[](count);
        RoutineLib.Routine[] memory calls = new RoutineLib.Routine[](count);
        for (uint256 i = 0; i < fcs.routineIds.length; i++) {
            address addr = fcs.routineIds[i];
            RoutineLib.Routine memory routine = fcs.routines[addr];
            FunctionLib.SbFunction memory fn = fs.funcs[routine.functionId];

            bool isActive = routine.status ==
                FunctionLib.FunctionStatus.ACTIVE ||
                routine.status == FunctionLib.FunctionStatus.NONE;

            if (fn.queueId == queueId && isActive) {
                calls[--count] = fcs.routines[addr];
                addrs[count] = addr;
            }
        }
        return (addrs, calls);
    }

    // Grab scheduled calls by their authority
    function getRoutinesByAuthority(
        address authority
    ) external view returns (address[] memory, RoutineLib.Routine[] memory) {
        RoutineLib.DiamondStorage storage fcs = RoutineLib.diamondStorage();

        uint256 count = 0;
        for (uint256 i = 0; i < fcs.routineIds.length; i++) {
            address addr = fcs.routineIds[i];
            RoutineLib.Routine memory routine = fcs.routines[addr];

            if (routine.authority == authority) {
                count++;
            }
        }
        address[] memory addrs = new address[](count);
        RoutineLib.Routine[] memory calls = new RoutineLib.Routine[](count);
        for (uint256 i = 0; i < fcs.routineIds.length; i++) {
            address addr = fcs.routineIds[i];
            RoutineLib.Routine memory routine = fcs.routines[addr];

            if (routine.authority == authority) {
                calls[--count] = fcs.routines[addr];
                addrs[count] = addr;
            }
        }
        return (addrs, calls);
    }

    function getRoutinesByFunctionId(
        address functionId
    ) external view returns (address[] memory, RoutineLib.Routine[] memory) {
        RoutineLib.DiamondStorage storage fcs = RoutineLib.diamondStorage();
        uint256 count = 0;
        for (uint256 i = 0; i < fcs.routineIds.length; i++) {
            address addr = fcs.routineIds[i];
            RoutineLib.Routine memory routine = fcs.routines[addr];
            if (routine.functionId == functionId) {
                count++;
            }
        }
        address[] memory addrs = new address[](count);
        RoutineLib.Routine[] memory calls = new RoutineLib.Routine[](count);
        for (uint256 i = 0; i < fcs.routineIds.length; i++) {
            address addr = fcs.routineIds[i];
            RoutineLib.Routine memory routine = fcs.routines[addr];

            if (routine.functionId == functionId) {
                calls[--count] = fcs.routines[addr];
                addrs[count] = addr;
            }
        }
        return (addrs, calls);
    }
}
