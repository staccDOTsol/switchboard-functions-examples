use std::error::Error;
use std::sync::Arc;

type ParentError = Arc<dyn Error + Send + Sync + 'static>;

#[derive(Clone, Debug)]
pub enum Err {
    Generic,
    SgxError,
    SgxWriteError,
    AnchorParse,
    TxFailure,
    NetworkErr,
    InvalidQuoteError,
    TxCompileErr,
    EnvVariableMissing,
    EvmError,
    InvalidKeypairFile,
    IpfsParseError,
    IpfsNetworkError,
    HeartbeatRoutineFailure,
    EventListenerRoutineFailure,
    TxDeserializationError,
    KeyParseError,
    QuoteParseError,
    InvalidInstructionError,
    AnchorParseError,
    IllegalFunctionOutput,
    FunctionResultParseError,
    QvnTxSendFailure,
    FunctionVerifyFailure,
    FunctionResultIllegalAccount,
    FunctionResultAccountsMismatch,
    FunctionResultInvalidData,
    FunctionResultInvalidPid,
    FunctionResultEmptyInstructions,
    AnchorLoadError,
    RequestKeyMissing,
    SolanaBlockhashError,
    SolanaSignError(ParentError, String),
    FunctionSimulationFailed,
    TxSendFailure,
}
impl std::error::Error for Err {}
impl std::fmt::Display for Err {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:#?}", self)
    }
}
