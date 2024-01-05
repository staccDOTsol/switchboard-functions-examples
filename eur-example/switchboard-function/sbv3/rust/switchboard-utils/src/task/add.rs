use crate::protos::oracle_job::*;
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;

pub fn add_task(ctx: &TaskRunnerContext, task: &AddTask) -> TaskResult<TaskOutput> {
    let input = ctx.value.clone();

    if input == TaskOutput::None {
        return Err(SbError::Message("AddTask requires an input"));
    }

    if task.addition.is_none() {
        return Err(SbError::Message("AddTask.addition is empty"));
    }

    let a: f64 = input.try_into()?;

    let b: f64 = match task.addition.clone().unwrap() {
        add_task::Addition::Scalar(v) => Ok(v),
        add_task::Addition::AggregatorPubkey(_) => Err(SbError::Message(
            "AddTask does not support multiplying by aggregator pubkey",
        )),
        add_task::Addition::Job(_) => Err(SbError::Message(
            "AddTask does not support multiplying by job pubkey",
        )),
        add_task::Addition::Big(v) => v.parse().map_err(|e| SbError::CustomError {
            message: format!("Failed to parse string ({:?}) to numeric value", { v }),
            source: std::sync::Arc::new(e),
        }),
    }?;

    Ok(TaskOutput::Num(a + b))
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
