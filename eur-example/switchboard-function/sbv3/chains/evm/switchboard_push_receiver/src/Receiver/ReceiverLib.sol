//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {EventLib} from "../event/EventLib.sol";
import {ErrorLib} from "../error/ErrorLib.sol";

library ReceiverLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.push.receiver.v1.storage");

    struct Result {
        int256 value;
        uint256 startedAt;
        uint256 updatedAt;
    }

    struct Feed {
        address feedId;
        bytes32 feedName;
        uint80 latestIntervalId;
        Result latestResult; // used by default for getLatestResult
        bool historyEnabled; // by default off so we don't store all feed histories for all 500+ feeds forever
        bool latestResultFailed;
    }

    struct DiamondStorage {
        // feed id to feed hash
        mapping(address => bytes32) feedIdToName;
        // feed hash -> interval hash -> price
        mapping(bytes32 => mapping(uint80 => Result)) results;
        // feed descriptions
        mapping(bytes32 => Feed) feeds;
        // feed hashes created
        bytes32[] feedNames;
        // latest timestamp
        uint256 latestTimestamp;
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

    function failureCallback(bytes32[] memory _feedNames) internal {
        DiamondStorage storage ds = diamondStorage();
        for (uint256 i = 0; i < _feedNames.length; i++) {
            ds.feeds[_feedNames[i]].latestResultFailed = true;
        }
    }

    // Switchboard Function will call this function with the feed ids and values
    function callback(
        bytes32[] memory _feedNames, // the function
        int256[] memory values,
        uint256 timestamp // time the query was started
    ) internal {
        DiamondStorage storage ds = diamondStorage();

        // mark latest timestamp
        ds.latestTimestamp = timestamp;

        // loop through the input arrays and set the prices
        for (uint256 i = 0; i < _feedNames.length; i++) {
            Feed storage feed = ds.feeds[_feedNames[i]];

            if (feed.latestResultFailed) {
                feed.latestResultFailed = false;
            }

            // make sure address pointer exists
            if (feed.feedId == address(0)) {
                // section mentioning this approach at https://docs.soliditylang.org/en/v0.8.9/types.html#address
                bytes32 b = _feedNames[i];
                b = keccak256(abi.encodePacked(b));
                address feedId = address(uint160(bytes20(b))); // cast bytes32 to bytes20 then to uint160 -> then address
                feed.feedName = _feedNames[i];
                feed.feedId = feedId;
                ds.feedIdToName[feedId] = _feedNames[i];
                ds.feedNames.push(_feedNames[i]);
            }

            // if history is enabled on the feed, set the last interval data
            if (feed.historyEnabled) {
                ds.results[_feedNames[i]][feed.latestIntervalId] = Result(
                    values[i],
                    timestamp,
                    block.timestamp
                );
            }

            // increment the latest interval id
            feed.latestIntervalId++;

            // Set latest result
            feed.latestResult = Result(values[i], timestamp, block.timestamp);

            // emit update event
            emit EventLib.NewResult(
                _feedNames[i],
                feed.latestIntervalId,
                values[i],
                timestamp
            );
        }
    }

    function toggleFeedHistory(address feedId, bool on) internal {
        DiamondStorage storage ds = diamondStorage();
        bytes32 feedName = ds.feedIdToName[feedId];
        Feed storage feed = ds.feeds[feedName];
        feed.historyEnabled = on;
    }

    function toggleAllFeedHistories(bool on) internal {
        DiamondStorage storage ds = diamondStorage();
        for (uint256 i = 0; i < ds.feedNames.length; i++) {
            Feed storage feed = ds.feeds[ds.feedNames[i]];
            feed.historyEnabled = on;
        }
    }

    function getAllFeeds() internal view returns (Feed[] memory) {
        DiamondStorage storage ds = diamondStorage();
        Feed[] memory allFeeds = new Feed[](ds.feedNames.length);
        for (uint256 i = 0; i < ds.feedNames.length; i++) {
            allFeeds[i] = ds.feeds[ds.feedNames[i]];
        }
        return allFeeds;
    }

    function results(
        bytes32 feedName,
        uint80 intervalId
    ) internal view returns (Result storage) {
        return diamondStorage().results[feedName][intervalId];
    }

    function feeds(bytes32 feedName) internal view returns (Feed storage) {
        return diamondStorage().feeds[feedName];
    }

    function feedNames() internal view returns (bytes32[] storage) {
        return diamondStorage().feedNames;
    }

    function feedIdToName(address feedId) internal view returns (bytes32) {
        return diamondStorage().feedIdToName[feedId];
    }

    function latestTimestamp() internal view returns (uint256) {
        return diamondStorage().latestTimestamp;
    }
}
