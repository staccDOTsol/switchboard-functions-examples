//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";
import {EnclaveLib} from "../enclave/EnclaveLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";

library StakingLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.staking.storage");

    struct Stake {
        uint256 amount;
        uint256 readyAt;
        uint256 unstakeReadyAt;
        uint256 lastUpdated;
        address token;
    }

    struct StakingConfig {
        address token;
        uint256 stakingAmount;
        uint256 stakingPeriod;
        uint256 unstakingPeriod;
    }

    struct DiamondStorage {
        mapping(address => StakingConfig) stakingConfigs;
        // queueId => token => totalStaked
        mapping(address => mapping(address => uint256)) totalStaked;
        // queueId => user address => tokenId => Stake
        mapping(address => mapping(address => mapping(address => Stake))) stakes;
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

    function setStakeConfig(
        address queueId,
        address token,
        uint256 stakingAmount,
        uint256 stakingPeriod,
        uint256 unstakingPeriod
    ) internal {
        StakingConfig storage config = stakingConfig(queueId);
        config.token = token;
        config.stakingAmount = stakingAmount;
        config.stakingPeriod = stakingPeriod;
        config.unstakingPeriod = unstakingPeriod;
    }

    function addStake(
        address queueId,
        address staker,
        uint256 amount
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        StakingConfig storage config = ds.stakingConfigs[queueId];
        Stake storage currentStake = ds.stakes[queueId][staker][config.token];

        bool startedWithLessThanRequiredStake = currentStake.amount <
            config.stakingAmount;
        ds.totalStaked[queueId][config.token] += amount;
        currentStake.amount += amount;
        currentStake.lastUpdated = block.timestamp;
        currentStake.unstakeReadyAt = 0;

        // if we pass the stake threshold, set the readyAt time
        if (
            startedWithLessThanRequiredStake &&
            currentStake.amount >= config.stakingAmount
        ) {
            currentStake.readyAt = block.timestamp + config.stakingPeriod;
        }
    }

    function unstake(address queueId, address token, address staker) internal {
        DiamondStorage storage ds = diamondStorage();
        Stake storage currentStake = ds.stakes[queueId][staker][token];
        StakingConfig storage config = ds.stakingConfigs[queueId];
        currentStake.unstakeReadyAt = block.timestamp + config.unstakingPeriod;
        currentStake.lastUpdated = block.timestamp;

        // prevent updates while unstaking
        currentStake.readyAt = 0;
    }

    // remove stake with a particular token from a staker
    // - this is only for salvaging tokens after erc20 address has been swapped
    function removeStakeWithToken(
        address queueId,
        address token,
        address staker,
        uint256 amount
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        StakingConfig storage config = ds.stakingConfigs[queueId];
        Stake storage currentStake = ds.stakes[queueId][staker][token];
        ds.totalStaked[queueId][config.token] -= amount;
        currentStake.amount -= amount;
        currentStake.lastUpdated = block.timestamp;
        currentStake.unstakeReadyAt = 0;
    }

    function removeStake(
        address queueId,
        address staker,
        uint256 amount
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        StakingConfig storage config = ds.stakingConfigs[queueId];
        Stake storage currentStake = ds.stakes[queueId][staker][config.token];

        ds.totalStaked[queueId][config.token] -= amount;
        currentStake.amount -= amount;
        currentStake.lastUpdated = block.timestamp;

        // always wipe readyAt when removing stake
        currentStake.readyAt = 0;
        currentStake.unstakeReadyAt = 0;
    }

    function slash(address queueId, address staker, uint256 amount) internal {
        DiamondStorage storage ds = diamondStorage();
        StakingConfig storage config = ds.stakingConfigs[queueId];
        Stake storage currentStake = ds.stakes[queueId][staker][config.token];
        ds.totalStaked[queueId][config.token] -= amount;
        currentStake.amount -= amount;
        currentStake.lastUpdated = block.timestamp;

        // always wipe readyAt when slashing
        currentStake.readyAt = 0;
        currentStake.unstakeReadyAt = 0;
    }

    /**
     * Views
     */

    function stakingConfig(
        address queueId
    ) internal view returns (StakingConfig storage) {
        return diamondStorage().stakingConfigs[queueId];
    }

    function totalStaked(
        address queueId,
        address token
    ) internal view returns (uint256) {
        return diamondStorage().totalStaked[queueId][token];
    }

    function stake(
        address queueId,
        address staker,
        address token
    ) internal view returns (Stake storage) {
        return diamondStorage().stakes[queueId][staker][token];
    }

    // check if staking is enabled
    function isStakingEnabled(address queueId) internal view returns (bool) {
        StakingConfig storage config = stakingConfig(queueId);
        return config.token != address(0);
    }

    // check if an enclave has full stake for a particular token
    function isEnclaveFullyStaked(
        address queueId,
        address staker
    ) internal view returns (bool) {
        DiamondStorage storage ds = diamondStorage();
        StakingConfig storage config = ds.stakingConfigs[queueId];
        Stake storage currentStake = ds.stakes[queueId][staker][config.token];

        // if config isn't set, then definition of fully staked is none
        if (config.token == address(0)) {
            return true;
        }

        // check that the stake is ready, and that it's at least the minimum stake, and that it's not zero
        return
            currentStake.readyAt <= block.timestamp &&
            currentStake.amount >= config.stakingAmount &&
            currentStake.readyAt != 0;
    }
}
