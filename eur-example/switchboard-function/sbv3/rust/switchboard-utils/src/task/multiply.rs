use crate::protos::oracle_job::*;
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;

pub fn multiply_task(ctx: &TaskRunnerContext, task: &MultiplyTask) -> TaskResult<TaskOutput> {
    let input = ctx.value.clone();

    if input == TaskOutput::None {
        return Err(SbError::Message("MultiplyTask requires an input"));
    }

    if task.multiple.is_none() {
        return Err(SbError::Message("MultiplyTask.multiple is empty"));
    }

    let a: f64 = input.try_into()?;

    let b: f64 = match task.multiple.clone().unwrap() {
        multiply_task::Multiple::Scalar(v) => Ok(v),
        multiply_task::Multiple::AggregatorPubkey(_) => Err(SbError::Message(
            "MultiplyTask does not support multiplying by aggregator pubkey",
        )),
        multiply_task::Multiple::Job(_) => Err(SbError::Message(
            "MultiplyTask does not support multiplying by job pubkey",
        )),
        multiply_task::Multiple::Big(v) => v.parse().map_err(|e| SbError::CustomError {
            message: format!("Failed to parse string ({:?}) to numeric value", { v }),
            source: std::sync::Arc::new(e),
        }),
    }?;

    Ok(TaskOutput::Num(a * b))
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
