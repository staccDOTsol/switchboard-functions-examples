//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {RequestLib} from "../request/RequestLib.sol";
import {FunctionLib} from "../sbFunction/FunctionLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {UtilLib} from "../util/UtilLib.sol";
import {Recipient} from "../util/Recipient.sol";
import {FunctionSettingsLib} from "../functionSettings/FunctionSettingsLib.sol";

contract FunctionSettings is Recipient {
    // optional settings relating to function call configuration
    function setFunctionSettings(
        address functionId,
        FunctionSettingsLib.FunctionSettings memory settings
    ) external guarded(GuardType.PUBLIC) {
        if (!FunctionLib.functionExists(functionId)) {
            revert ErrorLib.FunctionDoesNotExist(functionId);
        }

        // check authority
        FunctionLib.SbFunction storage fn = FunctionLib.funcs(functionId);
        if (msg.sender != fn.authority) {
            revert ErrorLib.InvalidAuthority(fn.authority, msg.sender);
        }

        // set function call settings
        FunctionSettingsLib.setFunctionSettings(functionId, settings);
    }

    function functionSettings(
        address functionId
    ) external view returns (FunctionSettingsLib.FunctionSettings memory) {
        FunctionSettingsLib.DiamondStorage storage fcs = FunctionSettingsLib
            .diamondStorage();
        FunctionSettingsLib.FunctionSettings memory settings = fcs
            .functionSettings[functionId];
        return settings;
    }
}
