//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {ReceiverLib} from "./ReceiverLib.sol";
import {Aggregator} from "./Aggregator.sol";
import {Recipient} from "../util/Recipient.sol";
import {ErrorLib} from "../error/ErrorLib.sol";
import {EventLib} from "../event/EventLib.sol";
import {AdminLib} from "../admin/AdminLib.sol";

// Main contract for Switchboard's Pull Model
contract Receiver is Recipient {
    // Switchboard Function will call this function with the feed ids and values
    function callback(
        bytes32[] memory _feedNames, // feed names
        int256[] memory values, // the value of the feed
        uint256 timestamp // data timestamp
    ) external {
        if (AdminLib.functionId() == address(0)) {
            AdminLib.setFunctionId(getMsgSender());
        }
        // Assert that the sender is switchboard & the correct function id is encoded
        verifySwitchboardFunction();

        // make sure the input lengths are correct
        if (_feedNames.length != values.length) {
            revert ErrorLib.IncorrectInputLength();
        }

        // Update each feed internally
        ReceiverLib.callback(_feedNames, values, timestamp);
    }

    // Failure callback - marking latest result as failed for a feed
    function failureCallback(
        bytes32[] memory _feedNames // feed names
    ) external {
        if (AdminLib.functionId() == address(0)) {
            AdminLib.setFunctionId(getMsgSender());
        }

        // Assert that the sender is switchboard & the correct function id is encoded
        verifySwitchboardFunction();

        // Update each feed internally
        ReceiverLib.failureCallback(_feedNames);
    }

    // Deploy a Classic Push Model Adapter
    function deployFeedAdapter(
        address feedId,
        string memory name,
        string memory description
    ) external {
        // get feed hash
        bytes32 feedName = ReceiverLib.feedIdToName(feedId);

        // create the aggregator contract
        Aggregator aggregator = new Aggregator(
            AdminLib.switchboard(),
            feedId,
            feedName,
            name,
            description
        );

        // Turn on feed history to enable adapter APIs for this feed in particular
        ReceiverLib.toggleFeedHistory(feedId, true);

        emit EventLib.NewAdapter(feedName, address(aggregator), msg.sender);
    }

    // Get the latest result for a feed
    function getLatestResult(
        address feedId
    )
        external
        returns (
            int256 value,
            uint256 timestamp,
            uint256 updatedAt,
            uint80 intervalId
        )
    {
        bytes32 feedName = ReceiverLib.feedIdToName(feedId);
        ReceiverLib.Feed memory feed = ReceiverLib.feeds(feedName);

        if (feed.latestResultFailed) {
            // if the latest result failed, the latest timestamp + updatedAt are the time the data
            // was actually received
            timestamp = feed.latestResult.startedAt;
            updatedAt = feed.latestResult.updatedAt;
        } else {
            // the latest timestamp is the last time the function ensured the variance threshold
            // was checked for the feed.
            timestamp = ReceiverLib.latestTimestamp();
            updatedAt = timestamp;
        }

        value = feed.latestResult.value;
        intervalId = feed.latestIntervalId;
        if (intervalId == 0) {
            revert ErrorLib.FeedUninitialized(feedId);
        }
        emit EventLib.ReadEvent(feedId, msg.sender, value, timestamp);
    }

    // View functions
    // results - get a result for a feed and interval   @NOTE: can return empty values
    // feeds - get a feed                               @NOTE: will return default values if feed doesn't exist
    // feedNames - get all feed names
    // getAllFeeds - get all feeds
    // latestTimestamp - get the timestamp of the latest updates

    function results(
        bytes32 feedName,
        uint80 intervalId
    ) external view returns (ReceiverLib.Result memory) {
        return ReceiverLib.results(feedName, intervalId);
    }

    function feeds(
        bytes32 feedName
    ) external view returns (ReceiverLib.Feed memory) {
        return ReceiverLib.feeds(feedName);
    }

    function feedNames() external view returns (bytes32[] memory) {
        return ReceiverLib.feedNames();
    }

    function getAllFeeds() public view returns (ReceiverLib.Feed[] memory) {
        ReceiverLib.Feed[] memory allFeeds = ReceiverLib.getAllFeeds();
        uint256 lts = ReceiverLib.latestTimestamp();
        // go through the feeds and add the latest result
        for (uint256 i = 0; i < allFeeds.length; i++) {
            ReceiverLib.Feed memory feed = allFeeds[i];
            if (!feed.latestResultFailed) {
                // if the latest result failed, the latest timestamp + updatedAt are the time the data
                // was actually received
                feed.latestResult.startedAt = lts;
                feed.latestResult.updatedAt = lts;
            }
        }
        return allFeeds;
    }

    function latestTimestamp() external view returns (uint256) {
        return ReceiverLib.latestTimestamp();
    }
}
