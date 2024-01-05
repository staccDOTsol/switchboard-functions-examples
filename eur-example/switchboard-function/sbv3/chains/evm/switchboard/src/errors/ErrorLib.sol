// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library ErrorLib {
    // 0x863b154f
    error AggregatorDoesNotExist(address aggregatorId);

    // 0xaf9b8e16
    error OracleQueueDoesNotExist(address oracleQueueId);

    // 0xcf479181
    error InsufficientBalance(uint256 expectedBalance, uint256 receivedBalance);

    // 0xe65d3ee3
    error AggregatorAlreadyExists(address aggregatorId);

    // 0x07fefd1f
    error OracleAlreadyExists(address oracleId);

    // 0xf7eac043
    error OracleExpired(address oracleId);

    // 0xbf89df83
    error InvalidAuthority(
        address expectedAuthority,
        address receivedAuthority
    );

    // 0x7ba5ffb5
    error InvalidSigner(address expectedSigner, address receivedSigner);

    // 0xd14e7c9b
    error InvalidArgument(uint256 argumentIndex);

    // 0xe65cb5d3
    error PermissionDenied(
        address granter,
        address grantee,
        uint256 permission
    );

    // 0x53b15160
    error InsufficientSamples(uint256 expected, uint256 received);

    // 0x9fcea1ba
    error EarlyOracleResponse(address oracleId);

    // 0xedfa5607
    error IntervalHistoryNotRecorded(address aggregatorId);

    // 0x93fc1a13
    error MrEnclaveNotAllowed(address queueId, bytes32 mrEnclave);

    // 0x2b69267c
    error QueuesDoNotMatch(address expectedQueueId, address receivedQueueId);

    // 0x9eb833a0
    error EnclaveUnverified(address enclaveId);

    // 0x089afb2c
    error EnclaveNotReadyForVerification(address enclaveId);

    // 0x4d7fe4fc
    error EnclaveNotOnQueue(address queueId, address enclaveId);

    // 0x1967584e
    error EnclaveNotAtQueueIdx(
        address queueId,
        address enclaveId,
        uint256 enclaveIdx
    );

    // 0xcd5d2b06
    error OracleNotOnQueue(address queueId, address oracleId);

    // 0x6dddf077
    error OracleNotAtQueueIdx(
        address queueId,
        address oracleId,
        uint256 oracleIdx
    );

    // 0x8bec1a4e
    error InvalidEnclave(address enclaveId);

    // 0xbc41a993
    error EnclaveExpired(address enclaveId);

    // 0x0da329cf
    error AttestationQueueDoesNotExist(address attestationQueueId);

    // 0x5c3197cc
    error EnclaveDoesNotExist(address enclaveId);

    // 0x3c3b1d62
    error FunctionDoesNotExist(address functionId);

    // 0x3af924d6
    error EnclaveAlreadyExists(address enclaveId);

    // 0x1179fb25
    error AttestationQueueAlreadyExists(address attestationQueueId);

    // 0x8f939dfd
    error FunctionAlreadyExists(address functionId);

    // 0x3c1222b1
    error InsufficientNodes(uint256 expected, uint256 received);

    // 0x887efaa5
    error InvalidEntry();

    // 0x1935f531
    error GasLimitExceeded(uint256 limit, uint256 used);

    // 0x6634e923
    error TransactionExpired(uint256 expirationTime);

    // 0xd1d36dcd
    error AlreadyExecuted(bytes32 txHash);

    // 0xd491963d
    error InvalidSignature(
        address expectedSender,
        bytes32 txHash,
        bytes signature
    );

    // 0x3926c8c8
    error FunctionCallerNotPermitted(address functionId, address sender);

    // 0x552d918e
    error FunctionMrEnclaveMismatch(bytes32 expected, bytes32 received);

    // 0xe2c62da7
    error FunctionSignerAlreadySet(address current, address received);

    // 0xf3663dbf
    error FunctionFeeTooLow(
        address functionId,
        uint256 expected,
        uint256 received
    );

    // 0xe726bd72
    error FunctionIncorrectTarget(address functionId, address received);

    // 0x3ff1de92
    error IncorrectReportedTime(uint256 maxExpectedTime, uint256 reportedTime);

    // 0xc7d91853
    error SubmittedResultsMismatch(uint256 aggregators, uint256 results);

    // 0xb209a6cc
    error ForceOverrideNotReady(address queueId);

    // 0xee56daf8
    error InvalidStatus(address account, uint256 expected, uint256 received);

    // 0x67c42515
    error ExcessiveGasSpent(uint256 gasLimit, uint256 gasSpent);

    // 0x00ea207e
    error ACLNotAdmin(address account);

    // 0xea9a4ba0
    error ACLNotAllowed(address account);

    // 0x7373cb0d
    error ACLAdminAlreadyInitialized();

    // 0x1c6cea40
    error InvalidCallbackParams(address callId, bytes32 hash);

    // 0x9334834f
    error IncorrectToken(address expected, address received);

    // 0x95eb946f
    error TokenTransferFailure(address token, address to, uint256 amount);

    // 0x8be9b6b3
    error StakeNotReady(address queueId, address staker, uint256 readyAt);

    // 0xc026a454
    error StakeNotReadyForWithdrawal(
        address queueId,
        address staker,
        uint256 readyAt
    );

    // 0x784ed478
    error EnclaveNotFullyStaked(address enclaveId);

    // 0xddd63c15
    error InvalidCallId(address callId);

    // 0x2277cabb
    error CallIdAlreadyExists(address callId);

    // 0xc6477cc1
    error InsufficientCallFeePaid(
        address callId,
        uint256 expected,
        uint256 received
    );

    // 0x7bfbdd60
    error InsufficientCallBalance(
        address callId,
        uint256 expected,
        uint256 received
    );

    // 0x7ec28264
   error CallExceededMaxGasCost(
        address callId,
        uint256 expected,
        uint256 received
    );

    // 0xcf9ccae6
    error IncorrectFunctionId(address expected, address received);

    // 0x704f61ed
    error RoutineIdAlreadyExists(address routineId);

    // 0xfefd00d8
    error RequestIdAlreadyExists(address requestId);

    // 0x0b532497
    error InvalidRoutineId(address routineId);

    // 0xe71fe28b
    error RoutinesDisabled(address functionId);

    // 0x0b5bc361
    error RequestAlreadyExists(address requestId);

    error Generic();
}
