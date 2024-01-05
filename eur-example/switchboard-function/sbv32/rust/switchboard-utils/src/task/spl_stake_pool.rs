
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;
pub use crate::protos::oracle_job::*;

// https://docs.rs/spl-stake-pool/latest/spl_stake_pool/
pub fn spl_stake_pool_task(_ctx: &TaskRunnerContext, _task: &SplStakePoolTask) -> TaskResult<TaskOutput> {
    return Err(SbError::CustomMessage("UNIMPLEMENTED".to_string()));
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
