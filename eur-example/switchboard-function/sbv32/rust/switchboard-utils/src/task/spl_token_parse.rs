
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;
pub use crate::protos::oracle_job::*;

// https://docs.rs/spl-token/latest/spl_token/
pub fn spl_token_parse_task(_ctx: &TaskRunnerContext, _task: &SplTokenParseTask) -> TaskResult<TaskOutput> {
    return Err(SbError::CustomMessage("UNIMPLEMENTED".to_string()));
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
