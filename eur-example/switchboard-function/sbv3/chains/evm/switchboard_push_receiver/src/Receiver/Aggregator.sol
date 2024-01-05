//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {Receiver} from "./Receiver.sol";
import {ReceiverLib} from "./ReceiverLib.sol";
import {ErrorLib} from "../error/ErrorLib.sol";

// CLASSIC PUSH ADAPTER INTERFACE
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract Aggregator is AggregatorV3Interface {
    Receiver public switchboardPricesContract;
    address public feedId;
    bytes32 public feedName;
    string public name;
    string public description;

    constructor(
        address _switchboard, // Switchboard contract address
        address _feedId,
        bytes32 _feedName, // Function id corresponding to the feed
        string memory _name, // Name of the feed
        string memory _description
    ) {
        switchboardPricesContract = Receiver(_switchboard);
        feedId = _feedId;
        feedName = _feedName;
        name = _name;
        description = _description;
    }

    function decimals() external pure override returns (uint8) {
        return 18;
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        // Get round data / Check if the round exists
        (
            roundId,
            answer,
            startedAt,
            updatedAt,
            answeredInRound
        ) = viewRoundData(_roundId);
        if (updatedAt == 0) {
            revert ErrorLib.RoundEmpty(feedName, roundId);
        }
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = switchboardPricesContract.feeds(feedName).latestIntervalId;
        if (roundId == 0) {
            revert ErrorLib.RoundEmpty(feedName, 0);
        }
        return viewLatestRoundData();
    }

    // View Functions (for off-chain use / no protection from empty rounds)

    function viewRoundData(
        uint80 _roundId
    )
        public
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        ReceiverLib.Feed memory feed = switchboardPricesContract.feeds(
            feedName
        );
        ReceiverLib.Result memory result;

        if (_roundId == feed.latestIntervalId) {
            result = feed.latestResult;
        } else {
            result = switchboardPricesContract.results(feedName, _roundId);
        }

        answer = result.value;
        startedAt = result.startedAt;
        updatedAt = result.updatedAt;
        roundId = _roundId;
        answeredInRound = _roundId;
    }

    function viewLatestRoundData()
        public
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        ReceiverLib.Result memory result = switchboardPricesContract
            .feeds(feedName)
            .latestResult;
        answer = result.value;
        startedAt = result.startedAt;
        updatedAt = result.updatedAt;
        roundId = roundId;
        answeredInRound = roundId;
    }
}
