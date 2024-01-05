//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {CallVerifyLib} from "../callVerify/CallVerifyLib.sol";

library FunctionSettingsLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.functionSettings.storage");

    struct FunctionSettings {
        // maximum gas cost that a function call can cost
        uint256 maxGasCost;
        // require isolated runs for each routine and request
        bool requireIsolatedRuns;
        // --- Routines ---
        // routines_disabled
        bool routinesDisabled;
        // require fn authority to sign new routines
        bool routinesRequireAuthorization;
        // routine users must pay a fee for each execution to the fn authority
        uint256 routineFee;
        // --- Requests ---
        // requests_disabled
        bool requestsDisabled;
        // require fn authority to sign new requests
        uint256 requestFee;
        // require fn authority to sign new routines
        bool requestsRequireAuthorization;
    }

    struct DiamondStorage {
        mapping(address => FunctionSettings) functionSettings; // function id -> function call settings
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

    function functionSettings(
        address functionSettingsId
    ) internal view returns (FunctionSettings storage) {
        return diamondStorage().functionSettings[functionSettingsId];
    }

    function setFunctionSettings(
        address functionId,
        FunctionSettings memory fs
    ) internal {
        diamondStorage().functionSettings[functionId] = fs;
    }
}
