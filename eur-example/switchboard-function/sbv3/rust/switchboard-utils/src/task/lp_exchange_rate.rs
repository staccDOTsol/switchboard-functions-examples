
use crate::TaskOutput;
use crate::TaskResult;
use crate::TaskRunnerContext;
use switchboard_common::error::SbError;
pub use crate::protos::oracle_job::*;

// https://docs.rs/whirlpools/0.3.0/whirlpools/
// https://docs.rs/solana-farm-sdk/latest/solana_farm_sdk/instruction/raydium/struct.RaydiumSwap.html
// Simulate above?
// Simulate these ixs?
// https://github.com/raydium-io/raydium-clmm/blob/master/client/src/main.rs#L431-L450
pub fn lp_exchange_rate_task(_ctx: &TaskRunnerContext, _task: &LpExchangeRateTask) -> TaskResult<TaskOutput> {
    return Err(SbError::CustomMessage("UNIMPLEMENTED".to_string()));
}

#[cfg(test)]
mod tests {


    #[tokio::test]
    async fn test_1() {}
}
