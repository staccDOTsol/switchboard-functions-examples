//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {CallVerifyLib} from "./CallVerifyLib.sol";
import {Recipient} from "../util/Recipient.sol";

contract CallVerify is Recipient {
    /**
     * verifyCallbackParams - used to verify that a function call was run with the correct params
     * - verifies that the function call was run with the correct params
     * @param callIds the callIds that were used to call the function
     * @param hashes the hashes that were used to call the function
     */
    function verifyCallbackParams(
        address[] memory callIds,
        bytes32[] memory hashes
    ) external view {
        CallVerifyLib.verify(callIds, hashes);
    }
}
