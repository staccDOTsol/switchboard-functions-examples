use crate::cast;
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;
pub use crate::protos::oracle_job::*;
use crate::TaskOutput::Num;
use crate::protos::round_task::Method;

fn validate(ctx: &TaskRunnerContext, task: &RoundTask) -> Result<(), SbError> {
    if let Num(_v) = ctx.value {
        return Ok(());
    } else {
        return Err(SbError::CustomMessage("round_task: Input value is not a number".to_string()));
    }
}

pub fn round_task(ctx: &TaskRunnerContext, task: &RoundTask) -> TaskResult<TaskOutput> {
    validate(ctx, task)?;
    let value = cast!(ctx.value, TaskOutput::Num).unwrap();
    let scale = 10_f64.powi(task.decimals.unwrap_or(0));
    // TODO: move to rust_decimal
    Ok(TaskOutput::Num(match task.method {
        Some(0) => (value * scale).ceil() / scale,
        Some(1) => (value * scale).floor() / scale,
        _ => value, // If no method is specified, return the value as is
    }))
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
