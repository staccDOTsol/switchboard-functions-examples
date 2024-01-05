use crate::*;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MsgInContainerVerifyData {
    pub container_registry: Option<String>, // dockerhub or ipfs
    pub container: String,
    pub version: Option<String>, // latest
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MsgOutContainerVerifyData {
    pub container_registry: String, // dockerhub or ipfs
    pub container: String,
    pub version: String, // latest
    pub is_valid: bool,
}
