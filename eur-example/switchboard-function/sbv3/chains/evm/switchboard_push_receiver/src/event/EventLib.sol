// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library EventLib {
    event NewResult(
        bytes32 indexed feedId,
        uint80 indexed roundId,
        int256 value,
        uint256 timestamp
    );
    event NewAdapter(
        bytes32 indexed feedId,
        address indexed adapter,
        address indexed sender
    );
    event ReadEvent(
        address indexed feedId,
        address indexed sender,
        int256 value,
        uint256 timestamp
    );
}
