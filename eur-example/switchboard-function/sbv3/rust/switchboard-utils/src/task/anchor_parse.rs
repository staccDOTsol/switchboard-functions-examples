use crate::protos::oracle_job::*;
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;

pub fn anchor_parse_task(_ctx: &TaskRunnerContext, _task: &AddTask) -> TaskResult<TaskOutput> {
    return Err(SbError::CustomMessage(
            "UNIMPLEMENTED: bundle js code that handles anchor_parse and call here".to_string(),
    ));
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
