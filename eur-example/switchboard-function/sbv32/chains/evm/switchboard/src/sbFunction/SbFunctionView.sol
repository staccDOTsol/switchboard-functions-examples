//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {FunctionLib} from "./FunctionLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {TransactionLib} from "../transaction/TransactionLib.sol";

import {Enclave} from "../enclave/Enclave.sol";
import {Recipient} from "../util/Recipient.sol";

contract SbFunctionView is Recipient {
    /**
     * view functions
     *
     * functionExists - check if a function exists
     * funcs - get a function by id
     * functionCalls - get a function call by id
     * getAllFunctions - get all functions
     * getFunctionsByAuthority - get all functions by authority
     * getActiveFunctionsByQueue - get all active functions by queue
     * isTrustedForwarder - always returns true (EIP2771)
     * estimateRunCost - estimate the cost of running a function
     * getFunctionMrEnclaves - get the mrEnclaves allowed for a given function id
     * getFunctionPermittedCallers - get the permitted callers for a given function id
     */

    function functionExists(address functionId) external view returns (bool) {
        return FunctionLib.functionExists(functionId);
    }

    function funcs(
        address functionId
    ) external view returns (FunctionLib.SbFunction memory) {
        if (!FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionDoesNotExist(functionId);
        }
        return FunctionLib.funcs(functionId);
    }

    function getAllFunctions()
        public
        view
        returns (address[] memory, FunctionLib.SbFunction[] memory)
    {
        FunctionLib.DiamondStorage storage ds = FunctionLib.diamondStorage();
        uint256 count = ds.functionIds.length;
        address[] memory addrs = new address[](count);
        FunctionLib.SbFunction[] memory fns = new FunctionLib.SbFunction[](
            count
        );
        for (uint256 i = 0; i < ds.functionIds.length; i++) {
            fns[--count] = ds.funcs[ds.functionIds[i]];
            addrs[count] = ds.functionIds[i];
        }
        return (addrs, fns);
    }

    function getFunctionsByAuthority(
        address user
    ) public view returns (address[] memory, FunctionLib.SbFunction[] memory) {
        FunctionLib.DiamondStorage storage ds = FunctionLib.diamondStorage();

        uint256 count = 0;
        for (uint256 i = 0; i < ds.functionIds.length; i++) {
            if (ds.funcs[ds.functionIds[i]].authority == user) {
                count++;
            }
        }
        address[] memory addrs = new address[](count);
        FunctionLib.SbFunction[] memory fns = new FunctionLib.SbFunction[](
            count
        );
        for (uint256 i = 0; i < ds.functionIds.length; i++) {
            if (ds.funcs[ds.functionIds[i]].authority == user) {
                fns[--count] = ds.funcs[ds.functionIds[i]];
                addrs[count] = ds.functionIds[i];
            }
        }
        return (addrs, fns);
    }

    function getActiveFunctionsByQueue(
        address queueId
    ) public view returns (address[] memory, FunctionLib.SbFunction[] memory) {
        FunctionLib.DiamondStorage storage ds = FunctionLib.diamondStorage();
        uint256 count = 0;
        for (uint256 i = 0; i < ds.functionIds.length; i++) {
            FunctionLib.SbFunction memory fn = ds.funcs[ds.functionIds[i]];

            if (fn.queueId != queueId) {
                continue;
            }
            count++;
            // if (
                // fn.status == FunctionLib.FunctionStatus.ACTIVE ||
                // fn.status == FunctionLib.FunctionStatus.NONE
            // ) {
                // count++;
            // }
        }
        address[] memory addrs = new address[](count);
        FunctionLib.SbFunction[] memory fns = new FunctionLib.SbFunction[](
            count
        );
        for (uint256 i = 0; i < ds.functionIds.length; i++) {
            FunctionLib.SbFunction memory fn = ds.funcs[ds.functionIds[i]];
            address addr = ds.functionIds[i];

            if (fn.queueId != queueId) {
                continue;
            }
            // if (
                // fn.status == FunctionLib.FunctionStatus.ACTIVE ||
                // fn.status == FunctionLib.FunctionStatus.NONE
            // ) {
                // --count;
                // fns[count] = fn;
                // addrs[count] = addr;
            // }
            --count;
            fns[count] = fn;
            addrs[count] = addr;
        }
        return (addrs, fns);
    }

    // EIP2771: always returns true
    function isTrustedForwarder(address) external pure returns (bool) {
        return true;
    }

    // EIP712 helper function
    function getTransactionHash(
        uint256 expirationTimeSeconds,
        uint256 gasLimit,
        uint256 value,
        address to,
        address from,
        bytes memory data
    ) external view returns (bytes32) {
        return
            TransactionLib.getTransactionHash(
                TransactionLib.Transaction({
                    to: to,
                    data: data,
                    value: value,
                    expirationTimeSeconds: expirationTimeSeconds,
                    gasLimit: gasLimit,
                    from: from
                })
            );
    }

    // Estimate gas cost only based off of latest run, not an accurate measurement
    // but a practical way to gauge run price on fairly permissioned / constant gas cost functions
    function estimatedRunCost(
        address functionId,
        uint256 gasPrice
    ) external view returns (uint256) {
        return FunctionLib.estimateRunCost(functionId, gasPrice);
    }

    // Get MrEnclaves Related to a function
    function getFunctionMrEnclaves(
        address functionId
    ) external view returns (bytes32[] memory) {
        FunctionLib.SbFunction memory fn = FunctionLib.funcs(functionId);
        return fn.config.mrEnclaves;
    }

    // Get Permitted Callers
    function getFunctionPermittedCallers(
        address functionId
    ) external view returns (address[] memory) {
        FunctionLib.SbFunction memory fn = FunctionLib.funcs(functionId);
        return fn.config.permittedCallers;
    }
}
