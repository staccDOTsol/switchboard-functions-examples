//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {AttestationQueueLib} from "../attestationQueue/AttestationQueueLib.sol";
import {EnclaveLib} from "../enclave/EnclaveLib.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";
import {Recipient} from "../util/Recipient.sol";
import {StakingLib} from "./StakingLib.sol";
import {IERC20} from "./IERC20.sol";

// Facet for managing allowed function measurements for a given fn
contract Staking is Recipient {
    event StakeAdded(
        address indexed queueId,
        address indexed staker,
        uint256 amount,
        address sender
    );

    event StakeRemoved(
        address indexed queueId,
        address indexed staker,
        uint256 amount,
        address sender
    );

    event Unstaked(
        address indexed queueId,
        address indexed staker,
        uint256 amount,
        address sender
    );

    function setStakingConfig(
        address queueId,
        address token,
        uint256 stakingAmount,
        uint256 stakingPeriod,
        uint256 unstakingPeriod
    ) external guarded(GuardType.ALLOWED) {
        if (!AttestationQueueLib.queueExists(queueId)) {
            revert ErrorLib.AttestationQueueDoesNotExist(queueId);
        }

        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(queueId);

        if (msg.sender != queue.authority) {
            revert ErrorLib.InvalidAuthority(queue.authority, msg.sender);
        }

        // set the staking config
        StakingLib.setStakeConfig(
            queueId,
            token,
            stakingAmount,
            stakingPeriod,
            unstakingPeriod
        );
    }

    // Add stake for a verifier
    function addStake(
        address enclaveId,
        uint256 amount
    ) external payable guarded(GuardType.PUBLIC) {
        if (!EnclaveLib.enclaveExists(enclaveId)) {
            revert ErrorLib.EnclaveDoesNotExist(enclaveId);
        }

        StakingLib.DiamondStorage storage ds = StakingLib.diamondStorage();

        EnclaveLib.Enclave storage enclave = EnclaveLib.enclaves(enclaveId);
        StakingLib.StakingConfig storage config = StakingLib.stakingConfig(
            enclave.queueId
        );

        // make sure we can't add stake if staking is off
        if (config.token == address(0)) {
            revert ErrorLib.IncorrectToken(address(0), config.token);
        }

        // only authority should be able to cancel an unstake with a stake action
        bool isAuthority = msg.sender == enclave.authority;
        bool isAlreadyUnstaking = ds
        .stakes[enclave.queueId][enclaveId][config.token].unstakeReadyAt != 0;
        if (!isAuthority && isAlreadyUnstaking) {
            revert ErrorLib.InvalidAuthority(enclave.authority, msg.sender);
        }

        // try withdraw
        bool success = IERC20(config.token).transferFrom(
            msg.sender,
            address(this),
            amount
        );

        // try to withdraw from the sender's erc20 token, if it fails, revert
        if (!success) {
            revert ErrorLib.TokenTransferFailure(
                config.token,
                address(this),
                amount
            );
        }

        // add stake to staker (enclaveId)
        StakingLib.addStake(enclave.queueId, enclaveId, amount);
        emit StakeAdded(enclave.queueId, enclaveId, amount, msg.sender);
    }

    // Unstake for a verifier (doesn't actually remove the stake, just sets the unstakeReadyAt time)
    function prepareUnstake(
        address enclaveId
    ) external guarded(GuardType.PUBLIC) {
        if (!EnclaveLib.enclaveExists(enclaveId)) {
            revert ErrorLib.EnclaveDoesNotExist(enclaveId);
        }

        StakingLib.DiamondStorage storage ds = StakingLib.diamondStorage();
        EnclaveLib.Enclave storage enclave = EnclaveLib.enclaves(enclaveId);
        StakingLib.StakingConfig storage config = StakingLib.stakingConfig(
            enclave.queueId
        );

        // make sure we can't add stake if staking is off
        if (config.token == address(0)) {
            revert ErrorLib.IncorrectToken(address(0), config.token);
        }

        if (msg.sender != enclave.authority) {
            revert ErrorLib.InvalidAuthority(enclave.authority, msg.sender);
        }

        StakingLib.unstake(enclave.queueId, config.token, msg.sender);
        emit Unstaked(
            enclave.queueId,
            enclaveId,
            ds.stakes[enclave.queueId][enclaveId][config.token].amount,
            msg.sender
        );
    }

    // Withdraw stake from a verifier
    function unstake(
        address enclaveId,
        uint256 amount
    ) external guarded(GuardType.PUBLIC) {
        if (!EnclaveLib.enclaveExists(enclaveId)) {
            revert ErrorLib.EnclaveDoesNotExist(enclaveId);
        }

        StakingLib.DiamondStorage storage ds = StakingLib.diamondStorage();

        EnclaveLib.Enclave storage enclave = EnclaveLib.enclaves(enclaveId);
        if (msg.sender != enclave.authority) {
            revert ErrorLib.InvalidAuthority(enclave.authority, msg.sender);
        }

        StakingLib.StakingConfig storage config = StakingLib.stakingConfig(
            enclave.queueId
        );

        // make sure we can't add stake if staking is off
        if (config.token == address(0)) {
            revert ErrorLib.IncorrectToken(address(0), config.token);
        }

        // check if unstake time has passed (and has been set at all)
        bool stakeNotReadyYet = ds
        .stakes[enclave.queueId][enclaveId][config.token].unstakeReadyAt >
            block.timestamp ||
            ds
            .stakes[enclave.queueId][enclaveId][config.token].unstakeReadyAt ==
            0;

        // make sure the stake is ready to be withdrawn
        if (stakeNotReadyYet) {
            revert ErrorLib.StakeNotReadyForWithdrawal(
                enclave.queueId,
                enclaveId,
                ds
                .stakes[enclave.queueId][enclaveId][config.token].unstakeReadyAt
            );
        }

        // remove stake from staker
        StakingLib.removeStake(enclave.queueId, enclaveId, amount);

        // transfer the stake to the sender
        bool success = IERC20(config.token).transfer(msg.sender, amount);
        if (!success) {
            revert ErrorLib.TokenTransferFailure(
                config.token,
                msg.sender,
                amount
            );
        }

        // success
        emit StakeRemoved(enclave.queueId, enclaveId, amount, msg.sender);
    }

    // In the case that the erc20 address has been swapped, this function allows the staker to recover their stake
    // doesn't need to be unstaked if the token has swapped
    function recoverStakeWithToken(
        address enclaveId,
        address token,
        uint256 amount
    ) external guarded(GuardType.PUBLIC) {
        if (!EnclaveLib.enclaveExists(enclaveId)) {
            revert ErrorLib.EnclaveDoesNotExist(enclaveId);
        }

        EnclaveLib.Enclave storage enclave = EnclaveLib.enclaves(enclaveId);
        if (msg.sender != enclave.authority) {
            revert ErrorLib.InvalidAuthority(enclave.authority, msg.sender);
        }

        StakingLib.StakingConfig storage config = StakingLib.stakingConfig(
            enclave.queueId
        );

        // make sure this is a real recovery
        if (config.token == token) {
            revert ErrorLib.IncorrectToken(config.token, token);
        }

        // remove stake
        StakingLib.removeStakeWithToken(
            enclave.queueId,
            token,
            msg.sender,
            amount
        );

        // transfer the stake to the sender
        bool success = IERC20(token).transfer(msg.sender, amount);
        if (!success) {
            revert ErrorLib.TokenTransferFailure(token, msg.sender, amount);
        }
    }

    // Slash stake from a verifier
    // This is currently shielded for admin use only
    function slashStake(
        address enclaveId,
        uint256 amount
    ) external guarded(GuardType.ADMIN) {
        if (!EnclaveLib.enclaveExists(enclaveId)) {
            revert ErrorLib.EnclaveDoesNotExist(enclaveId);
        }

        EnclaveLib.Enclave storage enclave = EnclaveLib.enclaves(enclaveId);
        StakingLib.StakingConfig storage config = StakingLib.stakingConfig(
            enclave.queueId
        );
        AttestationQueueLib.AttestationQueue storage queue = AttestationQueueLib
            .attestationQueues(enclave.queueId);

        if (msg.sender != queue.authority) {
            revert ErrorLib.InvalidAuthority(queue.authority, msg.sender);
        }

        // make sure we can't add stake if staking is off
        if (config.token == address(0)) {
            revert ErrorLib.IncorrectToken(address(0), config.token);
        }

        // remove stake
        StakingLib.slash(enclave.queueId, enclaveId, amount);

        // transfer the stake to the sender
        bool success = IERC20(config.token).transfer(msg.sender, amount);
        if (!success) {
            revert ErrorLib.TokenTransferFailure(
                config.token,
                msg.sender,
                amount
            );
        }

        // success
        emit StakeRemoved(enclave.queueId, enclaveId, amount, msg.sender);
    }

    /**
     * View functions
     * getStakeForEnclave - get the stake for an enclave
     * getStakeForEnclaveWithToken - get the stake for an enclave and token
     * getStakingConfig - get the staking config for a queue
     * totalStaked - get the total staked for a queue and token
     */
    function getStakeForEnclave(
        address enclaveId
    ) external view returns (StakingLib.Stake memory) {
        address queueId = EnclaveLib.enclaves(enclaveId).queueId;
        StakingLib.StakingConfig storage config = StakingLib.stakingConfig(
            queueId
        );
        return StakingLib.stake(queueId, enclaveId, config.token);
    }

    function getStakeForEnclaveWithToken(
        address enclaveId,
        address token
    ) external view returns (StakingLib.Stake memory) {
        address queueId = EnclaveLib.enclaves(enclaveId).queueId;
        return StakingLib.stake(queueId, enclaveId, token);
    }

    function getStakingConfig(
        address queueId
    ) external view returns (StakingLib.StakingConfig memory) {
        return StakingLib.stakingConfig(queueId);
    }

    function totalStaked(
        address queueId,
        address token
    ) external view returns (uint256) {
        return StakingLib.totalStaked(queueId, token);
    }
}
