//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library AggregatorLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.aggregator.storage");

    struct Aggregator {
        string name;
        address authority;
        Result latestResult;
        AggregatorConfig config;
        string jobsHash;
        address queueId;
        uint256 balanceLeftForInterval; // balance withdrawable each interval (minOracleResults * reward)
        uint256 nextIntervalRefreshTime; // time when the balance is refreshed
        uint80 intervalId; // interval id
        uint256 balance;
        bool historyEnabled;
    }

    struct AggregatorConfig {
        uint256 batchSize;
        uint256 minUpdateDelaySeconds;
        uint256 minOracleResults;
        uint256 varianceThreshold;
        uint256 minJobResults;
        uint256 forceReportPeriod;
    }

    struct AggregatorHistoryResult {
        int256 value;
        uint256 timestamp;
        uint256 medianTimestamp;
    }

    struct Result {
        int256 value;
        uint256 timestamp;
        address oracleId;
    }

    struct DiamondStorage {
        mapping(address => Aggregator) aggregators;
        mapping(address => Result[]) aggregatorResults;
        mapping(address => mapping(uint80 => AggregatorHistoryResult)) aggregatorHistory;
        address[] aggregatorIds;
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

    function aggregatorExists(
        address aggregatorId
    ) internal view returns (bool) {
        return
            diamondStorage().aggregators[aggregatorId].authority != address(0);
    }

    function pushAggregatorId(address aggregatorId) internal {
        diamondStorage().aggregatorIds.push(aggregatorId);
    }

    function setAggregatorConfig(
        address aggregatorId,
        string memory name,
        address authority,
        uint256 batchSize,
        uint256 minUpdateDelaySeconds,
        uint256 minOracleResults,
        string memory jobsHash,
        address queueId,
        uint256 varianceThreshold,
        uint256 minJobResults,
        uint256 forceReportPeriod,
        bool historyEnabled
    ) internal {
        Aggregator storage aggregator = diamondStorage().aggregators[
            aggregatorId
        ];
        aggregator.name = name;
        aggregator.authority = authority;
        aggregator.config = AggregatorConfig({
            batchSize: batchSize,
            minUpdateDelaySeconds: minUpdateDelaySeconds,
            minOracleResults: minOracleResults,
            varianceThreshold: varianceThreshold,
            minJobResults: minJobResults,
            forceReportPeriod: forceReportPeriod
        });
        aggregator.jobsHash = jobsHash;
        aggregator.queueId = queueId;
        aggregator.historyEnabled = historyEnabled;
    }

    function resetInterval(address aggregatorId) internal {
        Aggregator storage aggregator = diamondStorage().aggregators[
            aggregatorId
        ];
        aggregator.balanceLeftForInterval = 0;
        aggregator.nextIntervalRefreshTime = 0;
    }

    function refreshInterval(
        address aggregatorId,
        uint256 intervalRefreshAmount // amount of funds to refresh the interval with
    ) internal {
        Aggregator storage aggregator = diamondStorage().aggregators[
            aggregatorId
        ];

        // funds are taken from aggregator balance on payout so that no funds are lost when this is reset
        if (aggregator.balance < intervalRefreshAmount) {
            aggregator.balanceLeftForInterval = aggregator.balance;
        } else {
            aggregator.balanceLeftForInterval = intervalRefreshAmount;
        }

        aggregator.nextIntervalRefreshTime =
            block.timestamp +
            aggregator.config.minUpdateDelaySeconds;
        aggregator.intervalId++;
    }

    function addResultToWindow(
        address aggregatorId,
        address oracleId,
        int256 result
    ) internal returns (bool) {
        DiamondStorage storage ds = diamondStorage();
        Aggregator storage aggregator = ds.aggregators[aggregatorId];
        Result[] storage results = ds.aggregatorResults[aggregatorId];

        // remove any existing results from this oracle, mark oldest idx for removal (if needed)
        uint256 oldestIdx = 0;
        for (uint256 i = 0; i < results.length; i++) {
            // find oldest result by timestamp where oracle is not saver
            if (
                results[i].timestamp < results[oldestIdx].timestamp &&
                results[i].oracleId != oracleId
            ) {
                oldestIdx = i;
            }

            // find and remove existing result from this oracle
            if (results[i].oracleId == oracleId) {
                // TODO: evaluate this block - this flow was originally designed to allow oracles to update more frequently than the minUpdateDelaySeconds
                // but at their own loss of gas. This may no longer be desired, so we may want to remove this block
                // prevent individual oracles from updating too frequently
                if (
                    block.timestamp - results[i].timestamp <
                    aggregator.config.minUpdateDelaySeconds
                ) {
                    return false;
                }

                /// swap and pop the previous result by this oracle
                results[i] = results[results.length - 1];
                results.pop();
            }
        }

        // Push result to sliding window (of max size batchSize)
        results.push(
            Result({
                value: result,
                timestamp: block.timestamp,
                oracleId: oracleId
            })
        );

        // find oldest result by timestamp if out list of results is bigger
        if (results.length > aggregator.config.batchSize) {
            // else swap delete oldest result
            results[oldestIdx] = results[results.length - 1];
            results.pop();
        }

        return true;
    }

    function setLatestResult(
        address aggregatorId,
        int256 result,
        uint256 medianTimestamp,
        address oracleId
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        Aggregator storage aggregator = ds.aggregators[aggregatorId];
        aggregator.latestResult = Result({
            value: result,
            timestamp: block.timestamp,
            oracleId: oracleId
        });

        // if history is enabled, write it to the interval history as well
        if (aggregator.historyEnabled) {
            AggregatorHistoryResult storage history = ds.aggregatorHistory[
                aggregatorId
            ][aggregator.intervalId];

            history.value = result; // median result
            history.medianTimestamp = medianTimestamp; // timestamp of individual result taken
            history.timestamp = block.timestamp; // timestamp result was recorded as median
        }
    }

    function aggregators(
        address aggregatorId
    ) internal view returns (Aggregator storage) {
        return diamondStorage().aggregators[aggregatorId];
    }

    function aggregatorResults(
        address aggregatorId
    ) internal view returns (Result[] storage) {
        return diamondStorage().aggregatorResults[aggregatorId];
    }

    function aggregatorHistory(
        address aggregatorId,
        uint80 roundId
    ) internal view returns (AggregatorHistoryResult storage) {
        return diamondStorage().aggregatorHistory[aggregatorId][roundId];
    }

    function escrowFund(address aggregatorId, uint256 amount) internal {
        diamondStorage().aggregators[aggregatorId].balance += amount;
    }

    function escrowWithdraw(address aggregatorId, uint256 amount) internal {
        diamondStorage().aggregators[aggregatorId].balance -= amount;
    }

    function withdrawIntervalAndBalance(
        address aggregatorId,
        uint256 amount
    ) internal {
        Aggregator storage aggregator = diamondStorage().aggregators[
            aggregatorId
        ];
        aggregator.balanceLeftForInterval -= amount;
        aggregator.balance -= amount;
    }
}
