// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library ErrorLib {
    error ACLNotAdmin(address account);
    error ACLNotAllowed(address account);
    error ACLAdminAlreadyInitialized();
    error InvalidSender(address expected, address received);
    error InvalidFeedId(address feedId);
    error IncorrectInputLength();
    error RoundEmpty(bytes32 feedName, uint80 roundId);
    error FeedUninitialized(address feedId);
}
