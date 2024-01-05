use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;
pub use crate::protos::oracle_job::*;

fn validate(ctx: &TaskRunnerContext, task: &MinTask) -> Result<Vec<f64>, SbError> {
    let value = if let TaskOutput::Json(v) = &ctx.value {
        v
    } else {
        return Err(SbError::CustomMessage("min_task: Input value is not an array".to_string()));
    };
    let formatted = match value.as_array() {
        Some(array) => {
            let string_vec: Vec<f64> = array.iter()
                .filter_map(|item| item.as_str())
                .map(|s| s.to_string().parse::<f64>().unwrap())
                .collect();
            Ok(string_vec)
        },
        None => Err(SbError::CustomMessage("Not a JSON array".into()))
    };
    formatted
}

pub fn min_task(ctx: &TaskRunnerContext, task: &MinTask) -> TaskResult<TaskOutput> {
    let formatted = validate(ctx, task)?;
    let maybe_min = formatted.iter()
       .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
       .copied();
    if maybe_min.is_none() {
        return Err(SbError::CustomMessage("No minimum value found".into()));
    }
    Ok(TaskOutput::Num(maybe_min.unwrap()))
}

#[cfg(test)]
mod tests {

    #[tokio::test]
    async fn test_1() {}
}
