use crate::protos::oracle_job::*;
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;

pub fn value_task(_ctx: &TaskRunnerContext, task: &ValueTask) -> TaskResult<TaskOutput> {
    if task.value.is_none() {
        return Err(SbError::Message("ValueTask.value is empty"));
    }

    match task.value.clone().unwrap() {
        value_task::Value::Value(v) => Ok(TaskOutput::Num(v)),
        value_task::Value::Big(v) => {
            let result: f64 = v.parse().map_err(|e| SbError::CustomError {
                message: format!("Failed to parse string ({:?}) to numeric value", { v }),
                source: std::sync::Arc::new(e),
            })?;
            Ok(TaskOutput::Num(result))
        }
        value_task::Value::AggregatorPubkey(_) => Err(SbError::Message(
                "ValueTask does not support the aggregator pubkey field",
        )),
    }
}


#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
