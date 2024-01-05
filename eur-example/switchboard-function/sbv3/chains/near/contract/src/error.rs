use std::fmt;

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Switchboard Error: {:?}", self)
    }
}
impl<T> Into<Result<T, Error>> for Error {
    fn into(self) -> Result<T, Error> {
        Err(self)
    }
}

#[derive(Copy, Clone, Debug, PartialEq)]
pub enum Error {
    Generic,
    AggregatorInvalidBatchSize,
    InvalidUpdatePeriod,
    InvalidExpiration,
    InvalidAggregator,
    InvalidCrank,
    InvalidJob,
    InvalidOracle,
    InvalidPermission,
    InvalidQueue,
    InvalidAggregatorRound,
    NoResult,
    MathOverflow,
    MathUnderflow,
    DecimalConversionError,
    NoAggregatorJobsFound,
    PermissionDenied,
    ArrayOverflow,
    OracleMismatch,
    InsufficientQueueSize,
    CrankMaxCapacity,
    CrankEmptyError,
    InvalidAuthority,
    OracleAlreadyResponded,
    JobChecksumMismatch,
    IntegerOverflow,
    AggregatorIllegalRoundOpenCall,
    InvalidEscrow,
    InsufficientBalance,
    MintMismatch,
    InsufficientStake,
    ExcessiveCrankPushes,
    CrankNoElementsReady,
    InvalidKey,
    Unimplemented,
    SelfInvokeRequired,
    InsufficientGas,
    AggregatorEmpty,
    NotAllowedInPromise,
    ViewOnlyFunction,
    PredecessorFailed,
    InvalidAmount,
    InsufficientDeposit,
    InvalidNumberOfHistoryRows,
}
