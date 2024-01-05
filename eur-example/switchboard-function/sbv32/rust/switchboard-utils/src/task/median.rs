use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;
pub use crate::protos::oracle_job::*;

fn validate(ctx: &TaskRunnerContext, task: &MedianTask) -> Result<Vec<f64>, SbError> {
    let value = if let TaskOutput::Json(v) = &ctx.value {
        v
    } else {
        return Err(SbError::CustomMessage("median_task: Input value is not an array".to_string()));
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

pub fn median_task(_ctx: &TaskRunnerContext, _task: &MedianTask) -> TaskResult<TaskOutput> {
    return Err(SbError::CustomMessage("UNIMPLEMENTED".to_string()));
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
