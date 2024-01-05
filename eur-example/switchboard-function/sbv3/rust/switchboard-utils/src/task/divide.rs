use crate::protos::oracle_job::*;
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;

pub fn divide_task(ctx: &TaskRunnerContext, task: &DivideTask) -> TaskResult<TaskOutput> {
    let input = ctx.value.clone();

    if input == TaskOutput::None {
        return Err(SbError::Message("DivideTask requires an input"));
    }

    if task.denominator.is_none() {
        return Err(SbError::Message("DivideTask.multiple is empty"));
    }

    let a: f64 = input.try_into()?;

    let b: f64 = match task.denominator.clone().unwrap() {
        divide_task::Denominator::Scalar(v) => Ok(v),
        divide_task::Denominator::AggregatorPubkey(_) => Err(SbError::Message(
            "DivideTask does not support multiplying by aggregator pubkey",
        )),
        divide_task::Denominator::Job(_) => Err(SbError::Message(
            "DivideTask does not support multiplying by job pubkey",
        )),
        divide_task::Denominator::Big(v) => v.parse().map_err(|e| SbError::CustomError {
            message: format!("Failed to parse string ({:?}) to numeric value", { v }),
            source: std::sync::Arc::new(e),
        }),
    }?;

    Ok(TaskOutput::Num(a / b))
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
