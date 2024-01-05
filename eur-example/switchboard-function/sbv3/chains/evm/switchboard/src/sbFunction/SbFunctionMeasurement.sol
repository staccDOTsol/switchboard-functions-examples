//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {FunctionLib} from "./FunctionLib.sol";
import {Recipient} from "../util/Recipient.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";

// Facet for managing allowed function measurements for a given fn
contract SbFunctionMeasurement is Recipient {
    function addMrEnclaveToFunction(
        address functionId,
        bytes32 mrEnclave
    ) external guarded(GuardType.PUBLIC) {
        if (!FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionDoesNotExist(functionId);
        }
        FunctionLib.SbFunction storage fn = FunctionLib.funcs(functionId);
        if (msg.sender != fn.authority) {
            revert ErrorLib.InvalidAuthority(fn.authority, msg.sender);
        }

        FunctionLib.addMrEnclaveToFunction(functionId, mrEnclave);
    }

    function removeMrEnclaveFromFunction(
        address functionId,
        bytes32 mrEnclave
    ) external guarded(GuardType.PUBLIC) {
        if (!FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionDoesNotExist(functionId);
        }

        FunctionLib.SbFunction storage fn = FunctionLib.funcs(functionId);
        if (msg.sender != fn.authority) {
            revert ErrorLib.InvalidAuthority(fn.authority, msg.sender);
        }
        FunctionLib.removeMrEnclaveFromFunction(functionId, mrEnclave);
    }
}
