use crate::protos::oracle_job::*;
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;

pub fn subtract_task(ctx: &TaskRunnerContext, task: &SubtractTask) -> TaskResult<TaskOutput> {
    let input = ctx.value.clone();

    if input == TaskOutput::None {
        return Err(SbError::Message("SubtractTask requires an input"));
    }

    if task.subtraction.is_none() {
        return Err(SbError::Message("SubtractTask.subtraction is empty"));
    }

    let a: f64 = input.try_into()?;

    let b: f64 = match task.subtraction.clone().unwrap() {
        subtract_task::Subtraction::Scalar(v) => Ok(v),
        subtract_task::Subtraction::AggregatorPubkey(_) => Err(SbError::Message(
            "SubtractTask does not support multiplying by aggregator pubkey",
        )),
        subtract_task::Subtraction::Job(_) => Err(SbError::Message(
            "SubtractTask does not support multiplying by job pubkey",
        )),
        subtract_task::Subtraction::Big(v) => v.parse().map_err(|e| SbError::CustomError {
            message: format!("Failed to parse string ({:?}) to numeric value", { v }),
            source: std::sync::Arc::new(e),
        }),
    }?;

    Ok(TaskOutput::Num(a - b))
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
