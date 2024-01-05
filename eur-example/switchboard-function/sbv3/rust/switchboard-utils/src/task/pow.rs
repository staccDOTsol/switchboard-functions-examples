use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;
pub use crate::protos::oracle_job::*;
use crate::TaskOutput::Num;
use crate::cast;
use crate::protos::pow_task::Exponent::*;

fn validate(ctx: &TaskRunnerContext, task: &PowTask) -> Result<(), SbError> {
    if let Num(_v) = ctx.value {
        return Ok(());
    } else {
        return Err(SbError::CustomMessage("pow_task: Input value is not a number".to_string()));
    }
}

pub fn pow_task(ctx: &TaskRunnerContext, task: &PowTask) -> TaskResult<TaskOutput> {
    validate(ctx, task)?;
    let value = cast!(ctx.value, TaskOutput::Num).unwrap();
    let exponent = &task.exponent;
    let exponent = match exponent {
        Some(AggregatorPubkey(_key)) => return Err(SbError::CustomMessage("UNIMPLEMENTED".to_string())),
        Some(Big(v)) => v.parse::<f64>().unwrap_or_default(),
        Some(Scalar(v)) => *v, // If no method is specified, return the value as is
        _ => return Err(SbError::CustomMessage("INVALID".to_string())),
    };

    Ok(TaskOutput::Num(value.powf(exponent)))
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
