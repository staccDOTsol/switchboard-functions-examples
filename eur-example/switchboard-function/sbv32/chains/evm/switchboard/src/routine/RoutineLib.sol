//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {FunctionLib} from "../sbFunction/FunctionLib.sol";
import {CallVerifyLib} from "../callVerify/CallVerifyLib.sol";

library RoutineLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.routine.storage"); // <-- modifying this will wipe existing routines

    struct Routine {
        address functionId;
        address authority;
        string schedule;
        bytes params;
        uint256 lastCalledAt;
        uint256 consecutiveFailures;
        uint256 balance;
        FunctionLib.FunctionStatus status;
        uint8 errorCode;
        uint256 createdAt;
    }

    struct DiamondStorage {
        mapping(address => Routine) routines;
        address[] routineIds; // list of all function request addresses
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

    function setRoutine(
        address routineId,
        address functionId,
        address authority,
        string memory schedule,
        bytes memory params
    ) internal {
        // register params for callback verification
        CallVerifyLib.registerCallParams(routineId, params);
        DiamondStorage storage ds = diamondStorage();
        ds.routines[routineId] = Routine({
            functionId: functionId,
            authority: authority,
            schedule: schedule,
            params: params,
            lastCalledAt: 0,
            consecutiveFailures: 0,
            balance: 0,
            status: FunctionLib.FunctionStatus.NONE,
            errorCode: 0,
            createdAt: ds.routines[routineId].createdAt == 0
                ? block.timestamp
                : ds.routines[routineId].createdAt
        });
    }

    function pushRoutineId(address routineId) internal {
        DiamondStorage storage ds = diamondStorage();
        ds.routineIds.push(routineId);
    }

    function withdrawFunds(address routineId, uint256 amount) internal {
        DiamondStorage storage ds = diamondStorage();
        Routine storage routine = ds.routines[routineId];

        if (amount < routine.balance && routine.balance - amount < amount) {
            routine.status = FunctionLib.FunctionStatus.OUT_OF_FUNDS;
        }

        // get the funds transferred
        routine.balance -= amount;
    }

    function routineExists(address routineId) internal view returns (bool) {
        DiamondStorage storage ds = diamondStorage();

        // TODO: check if this is safe
        return ds.routines[routineId].functionId != address(0);
    }

    function escrowFund(address routineId, uint256 value) internal {
        DiamondStorage storage ds = diamondStorage();
        Routine storage routine = ds.routines[routineId];
        routine.balance += value;

        if (routine.balance == 0) {
            routine.status = FunctionLib.FunctionStatus.OUT_OF_FUNDS;
        } else {
            routine.status = FunctionLib.FunctionStatus.NONE;
        }
    }

    function escrowWithdraw(address routineId, uint256 value) internal {
        DiamondStorage storage ds = diamondStorage();
        Routine storage routine = ds.routines[routineId];
        routine.balance -= value;
    }

    function routines(address callId) internal view returns (Routine storage) {
        DiamondStorage storage ds = diamondStorage();
        Routine storage call = ds.routines[callId];
        return call;
    }
}
