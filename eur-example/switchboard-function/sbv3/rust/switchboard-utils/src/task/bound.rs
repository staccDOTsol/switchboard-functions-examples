use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;
pub use crate::protos::oracle_job::*;

pub fn bound_task(_ctx: &TaskRunnerContext, _task: &BoundTask) -> TaskResult<TaskOutput> {
    return Err(SbError::CustomMessage("UNIMPLEMENTED".to_string()));
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
