use crate::*;

#[error_code]
#[derive(Eq, PartialEq)]
pub enum SwitchboardError {
    #[msg("Illegal operation on a Switchboard array.")]
    ArrayOperationError,
    #[msg("Illegal operation on a Switchboard queue.")]
    QueueOperationError,
    #[msg("An account required to be owned by the program has a different owner.")]
    IncorrectProgramOwnerError,
    #[msg("Aggregator is not currently populated with a valid round.")]
    InvalidAggregatorRound,
    #[msg("Aggregator cannot fit any more jobs.")]
    TooManyAggregatorJobs,
    #[msg("Aggregator's current round is closed. No results are being accepted.")]
    AggregatorCurrentRoundClosed,
    #[msg("Aggregator received an invalid save result instruction.")]
    AggregatorInvalidSaveResult,
    #[msg("Failed to convert string to decimal format.")]
    InvalidStrDecimalConversion,
    #[msg("AccountLoader account is missing a required signature.")]
    AccountLoaderMissingSignature,
    #[msg("Account is missing a required signature.")]
    MissingRequiredSignature,
    #[msg("The attempted action will overflow a zero-copy account array.")]
    ArrayOverflowError,
    #[msg("The attempted action will underflow a zero-copy account array.")]
    ArrayUnderflowError,
    #[msg("The queried public key was not found.")]
    PubkeyNotFoundError,
    #[msg("Aggregator round open called too early.")]
    AggregatorIllegalRoundOpenCall,
    #[msg("Aggregator round close called too early.")]
    AggregatorIllegalRoundCloseCall,
    #[msg("Aggregator is closed. Illegal action.")]
    AggregatorClosedError,
    #[msg("Illegal oracle index.")]
    IllegalOracleIdxError,
    #[msg("The provided oracle has already responded this round.")]
    OracleAlreadyRespondedError,
    #[msg("Failed to deserialize protocol buffer.")]
    ProtoDeserializeError,
    #[msg("Unauthorized program state modification attempted.")]
    UnauthorizedStateUpdateError,
    #[msg("Not enough oracle accounts provided to closeRounds.")]
    MissingOracleAccountsError,
    #[msg("An unexpected oracle account was provided for the transaction.")]
    OracleMismatchError,
    #[msg("Attempted to push to a Crank that's at capacity")]
    CrankMaxCapacityError,
    #[msg("Aggregator update call attempted but attached lease has insufficient funds.")]
    AggregatorLeaseInsufficientFunds,
    #[msg("The provided token account does not point to the Switchboard token mint.")]
    IncorrectTokenAccountMint,
    #[msg("An invalid escrow account was provided.")]
    InvalidEscrowAccount,
    #[msg("Crank empty. Pop failed.")]
    CrankEmptyError,
    #[msg("Failed to derive a PDA from the provided seed.")]
    PdaDeriveError,
    #[msg("Aggregator account missing from provided account list.")]
    AggregatorAccountNotFound,
    #[msg("Permission account missing from provided account list.")]
    PermissionAccountNotFound,
    #[msg("Failed to derive a lease account.")]
    LeaseAccountDeriveFailure,
    #[msg("Failed to derive a permission account.")]
    PermissionAccountDeriveFailure,
    #[msg("Escrow account missing from provided account list.")]
    EscrowAccountNotFound,
    #[msg("Lease account missing from provided account list.")]
    LeaseAccountNotFound,
    #[msg("Decimal conversion method failed.")]
    DecimalConversionError,
    #[msg("Permission account is missing required flags for the given action.")]
    PermissionDenied,
    #[msg("Oracle queue is at lease capacity.")]
    QueueAtCapacity,
    #[msg("Data feed is already pushed on a crank.")]
    ExcessiveCrankRowsError,
    #[msg("Aggregator is locked, no setting modifications or job additions allowed.")]
    AggregatorLockedError,
    #[msg("Aggregator invalid batch size.")]
    AggregatorInvalidBatchSizeError,
    #[msg("Oracle provided an incorrect aggregator job checksum.")]
    AggregatorJobChecksumMismatch,
    #[msg("An integer overflow occurred.")]
    IntegerOverflowError,
    #[msg("Minimum update period is 5 seconds.")]
    InvalidUpdatePeriodError,
    #[msg("Aggregator round evaluation attempted with no results.")]
    NoResultsError,
    #[msg("An expiration constraint was broken.")]
    InvalidExpirationError,
    #[msg("An account provided insufficient stake for action.")]
    InsufficientStakeError,
    #[msg("The provided lease account is not active.")]
    LeaseInactiveError,
    #[msg("No jobs are currently included in the aggregator.")]
    NoAggregatorJobsFound,
    #[msg("An integer underflow occurred.")]
    IntegerUnderflowError,
    #[msg("An invalid oracle queue account was provided.")]
    OracleQueueMismatch,
    #[msg("An unexpected oracle wallet account was provided for the transaction.")]
    OracleWalletMismatchError,
    #[msg("An invalid buffer account was provided.")]
    InvalidBufferAccountError,
    #[msg("Insufficient oracle queue size.")]
    InsufficientOracleQueueError,
    #[msg("Invalid authority account provided.")]
    InvalidAuthorityError,
    #[msg("A provided token wallet is associated with an incorrect mint.")]
    InvalidTokenAccountMintError,
    #[msg("You must leave enough funds to perform at least 1 update in the lease.")]
    ExcessiveLeaseWithdrawlError,
    #[msg("Invalid history account provided.")]
    InvalideHistoryAccountError,
    #[msg("Invalid lease account escrow.")]
    InvalidLeaseAccountEscrowError,
    #[msg("Invalid crank provided.")]
    InvalidCrankAccountError,
    #[msg("No elements ready to be popped.")]
    CrankNoElementsReadyError,
    #[msg("Index out of bounds")]
    IndexOutOfBoundsError,
    #[msg("Invalid vrf request params")]
    VrfInvalidRequestError,
    #[msg("Vrf proof failed to verify")]
    VrfInvalidProofSubmissionError,
    #[msg("Error in verifying vrf proof.")]
    VrfVerifyError,
    #[msg("Vrf callback function failed.")]
    VrfCallbackError,
    #[msg("Invalid vrf callback params provided.")]
    VrfCallbackParamsError,
    #[msg("Vrf callback has already been triggered.")]
    VrfCallbackAlreadyCalledError,
    #[msg("The provided pubkey is invalid to use in ecvrf proofs")]
    VrfInvalidPubkeyError,
    #[msg("Number of required verify calls exceeded")]
    VrfTooManyVerifyCallsError,
    #[msg("Vrf request is already pending")]
    VrfRequestAlreadyLaunchedError,
    #[msg("Insufficient amount of proofs collected for VRF callback")]
    VrfInsufficientVerificationError,
    #[msg("An incorrect oracle attempted to submit a proof")]
    InvalidVrfProducerError,
    #[msg("Invalid SPLGovernance Account Supplied")]
    InvalidGovernancePidError,
    #[msg("An Invalid Governance Account was supplied")]
    InvalidGovernanceAccountError,
    #[msg("Expected an optional account")]
    MissingOptionalAccount,
    #[msg("Invalid Owner for Spawn Record")]
    InvalidSpawnRecordOwner,
    #[msg("Noop error")]
    NoopError,
    #[msg("A required instruction account was not included")]
    MissingRequiredAccountsError,
    #[msg("Invalid mint account passed for instruction")]
    InvalidMintError,
    #[msg("An invalid token account was passed into the instruction")]
    InvalidTokenAccountKeyError,
    #[msg("")]
    InvalidJobAccountError,
    #[msg("")]
    VoterStakeRegistryError,
    #[msg("Account discriminator did not match.")]
    AccountDiscriminatorMismatch,
    #[msg("This error is fucking impossible.")]
    FuckingImpossibleError,
    #[msg("Responding to the wrong VRF round")]
    InvalidVrfRound,
    #[msg("Job size has exceeded the max of 6400 bytes")]
    JobSizeExceeded,
    #[msg("Job loading can only support a maximum of 8 chunks")]
    JobChunksExceeded,
    #[msg("Job has finished initializing and is immutable")]
    JobDataLocked,
    #[msg("Job account has not finished initializing")]
    JobNotInitialized,
    #[msg("BufferRelayer round open called too early.")]
    BufferRelayerIllegalRoundOpenCall,
    #[msg("Invalid slider account.")]
    InvalidSliderAccount,
    #[msg("VRF lite account belongs to an existing pool.")]
    VrfLiteHasExistingPool,
    #[msg("VRF pool is at max capacity.")]
    VrfPoolFull,
    #[msg("VRF pool is empty.")]
    VrfPoolEmpty,
    #[msg("Failed to find VRF account in remaining accounts array.")]
    VrfAccountNotFound,
    #[msg("Account is not ready to be closed.")]
    AccountCloseNotReady,
    #[msg("VRF requested too soon.")]
    VrfPoolRequestTooSoon,
    #[msg("VRF pool miss.")]
    VrfPoolMiss,
    #[msg("VRF lite belongs to a pool.")]
    VrfLiteOwnedByPool,
    #[msg("Escrow has insufficient funds to perform this action.")]
    InsufficientTokenBalance,
    #[msg("Invalid SAS quote account")]
    InvalidQuoteError,
    #[msg("")]
    InvalidHistoryAccountError,
    #[msg("")]
    GenericError,
    #[msg("")]
    InvalidAuthorityState,
}
