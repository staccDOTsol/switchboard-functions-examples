use serde::{Deserialize, Serialize};

pub mod container_verify;
pub use container_verify::*;

pub mod echo;
pub use echo::*;

pub mod measurement;
pub use measurement::*;

pub mod solana_simulate;
pub use solana_simulate::*;

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum MsgIn {
    Echo(MsgInEchoData),
    ContainerVerify(MsgInContainerVerifyData),
    Measurement(MsgInMeasurementData),
    SolanaSimulate(MsgInSolanaSimulateData),
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum MsgOut {
    Echo(MsgOutEchoData),
    ContainerVerify(MsgOutContainerVerifyData),
    Measurement(MsgOutMeasurementData),
    SolanaSimulate(MsgOutSolanaSimulateData),
}
