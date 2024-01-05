//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {Recipient} from "./Recipient.sol";

contract ReceiverExample is Recipient {
    uint256 public randomValue;
    address functionId;
    uint timestamp;

    constructor(
        address _switchboard, // Switchboard contract address
    ) Recipient(_switchboard) {
    }

    function callback(uint256 value, address _functionId) external {
        // extract the sender from the callback, this validates that the switchboard contract called this function
        address msgSender = getMsgSender();

        if (functionId = address(0)) {
            functionId = _functionId;
        }

        // make sure the encoded caller is our function id
        if (msgSender != functionId) {
            revert("Invalid sender");
        }

        // set the random value
        randomValue = value;
        timestamp = block.timestamp;
    }

    function getLatestTrigger() public view returns (uint) {
        return timestamp;
    }
}