//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {RoutineLib} from "../routine/RoutineLib.sol";
import {RequestLib} from "../request/RequestLib.sol";
import {Recipient} from "../util/Recipient.sol";

contract CallBalance is Recipient {
    /**
     * Get the balance of a set of Requests and/or Routines
     */
    function callBalances(
        address[] memory callIds
    ) external view returns (uint256[] memory balances) {
        balances = new uint256[](callIds.length);
        for (uint256 i = 0; i < callIds.length; i++) {
            if (RequestLib.requestExists(callIds[i])) {
                balances[i] = RequestLib.requests(callIds[i]).balance;
                continue;
            } else {
                if (!RoutineLib.routineExists(callIds[i])) {
                    revert("CallBalance: callId does not exist");
                }
                balances[i] = RoutineLib.routines(callIds[i]).balance;
            }
        }
    }
}
