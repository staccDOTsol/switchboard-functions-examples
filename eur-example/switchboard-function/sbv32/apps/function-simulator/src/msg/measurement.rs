use crate::*;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MsgInMeasurementData {
    pub container_registry: Option<String>, // dockerhub or ipfs
    pub container: String,                  // container name (Ex. gallynaut/binance-oracle)
    pub version: Option<String>,            // latest
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MsgOutMeasurementData {
    pub container_registry: String, // dockerhub or ipfs
    pub container: String,          // container name (Ex. gallynaut/binance-oracle)
    pub version: String,            // latest
    pub mr_enclave: String,         // hex string
}
