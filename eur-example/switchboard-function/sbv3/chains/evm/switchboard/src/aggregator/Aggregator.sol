//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {AggregatorLib} from "./AggregatorLib.sol";
import {SortLib} from "./SortLib.sol";
import {OracleQueueLib} from "../oracleQueue/OracleQueueLib.sol";
import {OracleLib} from "../oracle/OracleLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {UtilLib} from "../util/UtilLib.sol";
import {Recipient} from "../util/Recipient.sol";
import {Oracle} from "../oracle/Oracle.sol";

contract Aggregator is Recipient {
    // Aggregator Events
    event AggregatorAccountInit(
        address indexed authority,
        address indexed accountId,
        uint256 timestamp
    );
    event AggregatorRead(
        address indexed aggregatorId,
        address indexed reader,
        int256 value
    );
    event AggregatorSaveResult(
        address indexed aggregatorId,
        address indexed oracle,
        int256 indexed value
    );
    event AggregatorUpdate(
        address indexed aggregatorId,
        int256 indexed value,
        uint256 timestamp
    );
    event AggregatorOpenInterval(
        address indexed aggregatorId,
        uint256 indexed intervalId
    );
    event AggregatorFundEvent(
        address indexed aggregatorId,
        address indexed funder,
        uint256 indexed amount
    );
    event AggregatorWithdrawEvent(
        address indexed aggregatorId,
        address indexed funder,
        uint256 indexed amount
    );
    event OraclePayoutEvent(
        address indexed oracleId,
        address indexed aggregatorId,
        uint256 indexed amount
    );
    event AggregatorIntervalRefreshed(
        address indexed aggregatorId,
        uint256 indexed intervalId,
        uint256 indexed balanceLeftForInterval
    );
    event AggregatorSettingsUpdated(
        address indexed aggregatorId,
        uint256 minUpdateDelaySeconds,
        uint256 minOracleResults,
        uint256 varianceThreshold,
        uint256 minJobResults,
        uint256 forceReportPeriod
    );

    function createAggregator(
        string memory name,
        address authority, // authority is the owner of the aggregator
        uint256 batchSize, // how many medians should be fetched per result
        uint256 minUpdateDelaySeconds, // how long to wait before updating
        uint256 minOracleResults, // how many results to wait for before reporting
        string memory jobsHash, // IPFS hash of the jobs
        address queueId, // address of the queue to use
        uint256 varianceThreshold, // how much variance is allowed before forcing a result
        uint256 minJobResults, // how many results to wait for before returning
        uint256 forceReportPeriod, // how long to wait before forcing a result
        bool enableHistory // whether to enable history
    ) external payable guarded(GuardType.PUBLIC) {
        address accountId = UtilLib.generateId();
        if (AggregatorLib.aggregatorExists(accountId)) {
            revert ErrorLib.AggregatorAlreadyExists(accountId);
        }
        AggregatorLib.setAggregatorConfig(
            accountId,
            name,
            authority,
            batchSize,
            minUpdateDelaySeconds,
            minOracleResults,
            jobsHash,
            queueId,
            varianceThreshold,
            minJobResults,
            forceReportPeriod,
            enableHistory
        );
        AggregatorLib.pushAggregatorId(accountId);

        // fund the aggregator we just created so feed creation can be 1 tx
        AggregatorLib.escrowFund(accountId, msg.value);

        // log creation and funding events
        emit AggregatorAccountInit(authority, accountId, block.timestamp);
        emit AggregatorFundEvent(accountId, msg.sender, msg.value);
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
        bool enableHistory
    ) external guarded(GuardType.PUBLIC) {
        AggregatorLib.Aggregator storage aggregator = AggregatorLib.aggregators(
            aggregatorId
        );

        if (aggregator.authority != msg.sender) {
            revert ErrorLib.InvalidAuthority(aggregator.authority, msg.sender);
        }

        AggregatorLib.setAggregatorConfig(
            aggregatorId,
            name,
            authority,
            batchSize,
            minUpdateDelaySeconds,
            minOracleResults,
            jobsHash,
            queueId,
            varianceThreshold,
            minJobResults,
            forceReportPeriod,
            enableHistory
        );

        // reset interval data to track payouts correctly
        AggregatorLib.resetInterval(aggregatorId);

        // track relevant aggregator settings updates
        emit AggregatorSettingsUpdated(
            aggregatorId,
            minUpdateDelaySeconds,
            minOracleResults,
            varianceThreshold,
            minJobResults,
            forceReportPeriod
        );
    }

    // open aggregator interval (manually request update for aggregator)
    function openInterval(
        address aggregatorId
    ) external payable guarded(GuardType.PUBLIC) {
        AggregatorLib.Aggregator storage aggregator = AggregatorLib.aggregators(
            aggregatorId
        );
        uint256 reward = OracleQueueLib.oracleQueues(aggregator.queueId).reward;

        if (msg.value < reward * (aggregator.config.minOracleResults + 1)) {
            revert ErrorLib.InsufficientBalance(
                reward * (aggregator.config.minOracleResults + 1),
                msg.value
            );
        }

        AggregatorLib.refreshInterval(
            aggregatorId,
            reward * (aggregator.config.minOracleResults + 1)
        );

        AggregatorLib.escrowFund(aggregatorId, msg.value);
        emit AggregatorFundEvent(aggregatorId, msg.sender, msg.value);

        // mark that the interval balance has refreshed
        emit AggregatorIntervalRefreshed(
            aggregatorId,
            aggregator.intervalId,
            aggregator.balanceLeftForInterval
        );

        // signal this request to oracles
        emit AggregatorOpenInterval(aggregatorId, aggregator.intervalId);
    }

    // Add value to an aggregator
    function aggregatorEscrowFund(
        address accountId
    ) external payable guarded(GuardType.PUBLIC) {
        if (!AggregatorLib.aggregatorExists(accountId)) {
            revert ErrorLib.AggregatorDoesNotExist(accountId);
        }
        AggregatorLib.escrowFund(accountId, msg.value);
        emit AggregatorFundEvent(accountId, msg.sender, msg.value);
    }

    // Remove value from an aggregator
    function aggregatorEscrowWithdraw(
        address payable recipient,
        address aggregatorId,
        uint256 amount
    ) external guarded(GuardType.PUBLIC) {
        AggregatorLib.Aggregator storage aggregator = AggregatorLib.aggregators(
            aggregatorId
        );
        if (aggregator.authority != msg.sender) {
            revert ErrorLib.InvalidAuthority(aggregator.authority, msg.sender);
        } else if (aggregator.balance < amount) {
            revert ErrorLib.InsufficientBalance(amount, aggregator.balance);
        }
        AggregatorLib.escrowWithdraw(aggregatorId, amount);
        recipient.transfer(amount);
        emit AggregatorWithdrawEvent(aggregatorId, msg.sender, amount);
    }

    function saveResults(
        address[] calldata ids, // Aggregator ids
        int256[] calldata results, // Results from the oracle for each feed listed in ids
        address queueId, // Oracle Queue Id
        uint256 oracleIdx // Oracle Index in the queue
    ) external guarded(GuardType.ALLOWED) {
        if (ids.length != results.length) {
            revert ErrorLib.SubmittedResultsMismatch(
                ids.length,
                results.length
            );
        }

        OracleQueueLib.OracleQueue storage queue = OracleQueueLib.oracleQueues(
            queueId
        );
        address oracleId = queue.oracles[oracleIdx];
        address msgSender = getMsgSender();

        // ensure that the oracle is in the queue
        if (OracleLib.oracles(oracleId).authority != msgSender) {
            revert ErrorLib.InvalidAuthority(
                OracleLib.oracles(oracleId).authority,
                msgSender
            );
        }

        // check that oracle is still valid / not expired
        if (
            (OracleLib.oracles(oracleId).lastHeartbeat + queue.oracleTimeout) <
            block.timestamp
        ) {
            revert ErrorLib.OracleExpired(oracleId);
        }

        // update the current idx to the next oracle in the queue - this way we can have a write idx
        // that oracles can search for updates
        OracleQueueLib.incrementCurrIdx(queueId);

        // ensure that all the aggregators are on the same queue (that we have authority to operate on)
        for (uint256 i = 0; i < ids.length; i++) {
            if (AggregatorLib.aggregators(ids[i]).queueId != queueId) {
                revert ErrorLib.QueuesDoNotMatch(
                    AggregatorLib.aggregators(ids[i]).queueId,
                    queueId
                );
            }
            saveResult(ids[i], oracleId, results[i]);
        }
    }

    function saveResult(
        address aggregatorId,
        address oracleId,
        int256 result
    ) internal {
        // snapshot gas left
        uint256 remainingGas = gasleft();

        // oracle authority should be pre-validated
        AggregatorLib.DiamondStorage storage ds = AggregatorLib
            .diamondStorage();

        AggregatorLib.Aggregator storage aggregator = ds.aggregators[
            aggregatorId
        ];

        // handle rewards
        uint256 reward = OracleQueueLib.oracleQueues(aggregator.queueId).reward;

        // handle payable balance reset - move funds into interval balance
        if (block.timestamp >= aggregator.nextIntervalRefreshTime) {
            AggregatorLib.refreshInterval(
                aggregatorId,
                reward * (aggregator.config.minOracleResults + 1)
            );
            emit AggregatorIntervalRefreshed(
                aggregatorId,
                aggregator.intervalId,
                aggregator.balanceLeftForInterval
            );
        }
        bool success = AggregatorLib.addResultToWindow(
            aggregatorId,
            oracleId,
            result
        );

        if (!success) {
            revert ErrorLib.EarlyOracleResponse(oracleId);
        }

        // get results from aggregator
        AggregatorLib.Result[] storage results = ds.aggregatorResults[
            aggregatorId
        ];

        // Handle value update if minOracleResults exceeded
        if (results.length >= aggregator.config.minOracleResults) {
            (int256 median, uint256 medianTimestamp) = SortLib.getMedian(
                results
            );

            AggregatorLib.setLatestResult(
                aggregatorId,
                median,
                medianTimestamp,
                oracleId
            );

            emit AggregatorUpdate(
                aggregatorId,
                aggregator.latestResult.value,
                aggregator.latestResult.timestamp
            );
        }

        // Log save result call
        emit AggregatorSaveResult(aggregatorId, oracleId, result);

        // check for excessive gas spend
        uint256 gasSpent = remainingGas - gasleft();

        // ~3x the highest gas cost of saveResult (as seen in testing) as a gas cap
        if (gasSpent > 2_000_000) {
            revert ErrorLib.ExcessiveGasSpent(2_000_000, gasSpent);
        }

        // handle payment for oracle results - don't err out for now, just don't pay
        uint256 fullReward = reward + gasSpent * tx.gasprice;

        // remove funds from interval balance if we can (and if reward is not 0)
        if (aggregator.balanceLeftForInterval >= fullReward && reward != 0) {
            AggregatorLib.withdrawIntervalAndBalance(aggregatorId, fullReward);

            // track total payouts
            emit OraclePayoutEvent(
                oracleId,
                aggregatorId,
                fullReward // reward + gas spent on saveResult (does not necessarily cover fixed batch reward)
            );

            // pay oracle for gas spend + reward - handing off trust to the oracle operator address
            payable(OracleLib.oracles(oracleId).authority).transfer(fullReward);
        }
    }

    /***
     * view functions below
     * aggregators - get a specific aggregator by id
     * latestResult - standard read into a switchboard feed
     * getIntervalResult - get the data for an interval [REQUIRES historyEnabled = true]
     * getCurrentIntervalId - get the current interval id for an aggregator
     * getAggregatorsByAuthority - get all aggregators for an authority
     * getAllAggregators - get all aggregators
     * viewAggregatorResults - get the results for an aggregator
     * viewLatestResult - get the latest result for an aggregator
     */

    // Read the latest result from an aggregator
    function latestResult(
        address aggregatorId
    ) external returns (int256 value, uint256 timestamp) {
        AggregatorLib.DiamondStorage storage ds = AggregatorLib
            .diamondStorage();

        AggregatorLib.Aggregator storage aggregator = ds.aggregators[
            aggregatorId
        ];

        AggregatorLib.Result[] storage results = ds.aggregatorResults[
            aggregatorId
        ];

        if (aggregator.config.minOracleResults > results.length) {
            revert ErrorLib.InsufficientSamples(
                aggregator.config.minOracleResults,
                results.length
            );
        }

        AggregatorLib.Result memory result = aggregator.latestResult;

        // track reads to be able to calculate usage
        emit AggregatorRead(aggregatorId, msg.sender, result.value);
        value = result.value;
        timestamp = result.timestamp;
    }

    // Read the latest result from an aggregator for a given interval
    function getIntervalResult(
        address aggregatorId,
        uint80 intervalId
    )
        external
        returns (int256 value, uint256 timestamp, uint256 medianTimestamp)
    {
        AggregatorLib.DiamondStorage storage ds = AggregatorLib
            .diamondStorage();
        AggregatorLib.Aggregator storage aggregator = ds.aggregators[
            aggregatorId
        ];

        if (!aggregator.historyEnabled && intervalId == aggregator.intervalId) {
            // if history is not enabled, we can only read the latest result
            AggregatorLib.Result[] storage results = ds.aggregatorResults[
                aggregatorId
            ];

            // make sure we don't return zeroed out data - this can happen if the aggregator has not yet reported
            if (aggregator.config.minOracleResults > results.length) {
                revert ErrorLib.InsufficientSamples(
                    aggregator.config.minOracleResults,
                    results.length
                );
            }

            emit AggregatorRead(
                aggregatorId,
                msg.sender,
                aggregator.latestResult.value
            );

            return (
                aggregator.latestResult.value,
                aggregator.latestResult.timestamp,
                aggregator.latestResult.timestamp // medianTimestamp is not used in this case
            );
        }

        AggregatorLib.AggregatorHistoryResult storage result = ds
            .aggregatorHistory[aggregatorId][intervalId];

        // make sure we don't return bad data
        if (result.medianTimestamp == 0) {
            revert ErrorLib.IntervalHistoryNotRecorded(aggregatorId);
        }

        emit AggregatorRead(aggregatorId, msg.sender, result.value);
        value = result.value; // the median value of batchSize results
        timestamp = result.timestamp; // when the aggregator reported the result
        medianTimestamp = result.medianTimestamp; // median timestamp of the results considered
    }

    // get the latest result from an aggregator to access historical data
    function getCurrentIntervalId(
        address aggregatorId
    ) external view returns (uint80 roundId) {
        AggregatorLib.DiamondStorage storage ds = AggregatorLib
            .diamondStorage();
        return ds.aggregators[aggregatorId].intervalId;
    }

    // view fn to snag owned aggregators
    function getAggregatorsByAuthority(
        address user
    )
        external
        view
        returns (address[] memory, AggregatorLib.Aggregator[] memory)
    {
        AggregatorLib.DiamondStorage storage ds = AggregatorLib
            .diamondStorage();

        uint256 count = 0;
        for (uint256 i = 0; i < ds.aggregatorIds.length; i++) {
            if (ds.aggregators[ds.aggregatorIds[i]].authority == user) {
                count++;
            }
        }
        address[] memory addrs = new address[](count);
        AggregatorLib.Aggregator[] memory aggs = new AggregatorLib.Aggregator[](
            count
        );
        for (uint256 i = 0; i < ds.aggregatorIds.length; i++) {
            if (ds.aggregators[ds.aggregatorIds[i]].authority == user) {
                aggs[--count] = ds.aggregators[ds.aggregatorIds[i]];
                addrs[count] = ds.aggregatorIds[i];
            }
        }
        return (addrs, aggs);
    }

    function getAllAggregators()
        external
        view
        returns (address[] memory, AggregatorLib.Aggregator[] memory)
    {
        AggregatorLib.DiamondStorage storage ds = AggregatorLib
            .diamondStorage();

        uint256 count = ds.aggregatorIds.length;
        address[] memory addrs = new address[](count);
        AggregatorLib.Aggregator[] memory aggs = new AggregatorLib.Aggregator[](
            count
        );
        for (uint256 i = 0; i < ds.aggregatorIds.length; i++) {
            aggs[--count] = ds.aggregators[ds.aggregatorIds[i]];
            addrs[count] = ds.aggregatorIds[i];
        }
        return (addrs, aggs);
    }

    function aggregators(
        address aggregatorId
    ) external view returns (AggregatorLib.Aggregator memory) {
        return AggregatorLib.aggregators(aggregatorId);
    }

    function aggregatorHistory(
        address aggregatorId,
        uint80 roundId
    ) external view returns (AggregatorLib.AggregatorHistoryResult memory) {
        return AggregatorLib.aggregatorHistory(aggregatorId, roundId);
    }

    function viewAggregatorResults(
        address aggregatorId
    ) external view returns (AggregatorLib.Result[] memory) {
        return AggregatorLib.aggregatorResults(aggregatorId);
    }

    function viewLatestResult(
        address aggregatorId
    ) external view returns (int256 value, uint256 timestamp) {
        AggregatorLib.Aggregator memory aggregator = AggregatorLib.aggregators(
            aggregatorId
        );
        value = aggregator.latestResult.value;
        timestamp = aggregator.latestResult.timestamp;
    }
}
