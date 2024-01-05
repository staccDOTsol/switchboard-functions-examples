use crate::*;
use std::str::FromStr;
use switchboard_solana::{
    anchor_spl::token::spl_token::native_mint::ID as NativeMint,
    find_associated_token_address,
    prelude::anchor_lang::prelude::Pubkey,
    prelude::solana_client::rpc_client::RpcClient,
    prelude::{anchor_client::Cluster, borsh::BorshDeserialize, borsh::BorshSerialize},
    AttestationQueueAccountData, FunctionAccountData, FunctionRequestAccountData,
    SolanaFunctionEnvironment, VerifierAccountData,
};

fn default_cluster() -> Cluster {
    Cluster::Devnet
}

#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SolanaSimulateParams {
    pub container: Option<String>,

    pub container_registry: Option<String>,
    pub version: Option<String>,

    pub fn_data: Option<String>,
    pub fn_request_key: Option<String>,
    pub fn_request_data: Option<String>,
    pub payer: Option<String>,
    pub verifier: Option<String>,
    pub reward_receiver: Option<String>,

    pub queue_authority: Option<String>,
    pub verifier_enclave_signer: Option<String>,
}
#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MsgInSolanaSimulateData {
    pub fn_key: String, // also the id
    #[serde(default = "default_cluster")]
    pub cluster: Cluster, // defaults to mainnet
    #[serde(default)]
    pub params: SolanaSimulateParams, // override network data
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MsgOutSolanaSimulateData {
    pub fn_key: String, // also the id
    pub image_name: String,
    pub result: Option<String>,
    pub error: Option<String>,
    pub logs: Option<Vec<String>>,
}

pub struct SolanaSimulate {
    pub cluster: Cluster,

    pub image_name: String,
    pub container_registry: String,

    pub env: SolanaFunctionEnvironment,
}

impl MsgInSolanaSimulateData {
    pub async fn validate(
        &self,
        rpc_url: String,
    ) -> Result<SolanaSimulate, Box<dyn std::error::Error + Send + Sync>> {
        let client = RpcClient::new(rpc_url);

        // TODO: handle defaults (based on cluster?)

        // first attempt to load all pubkeys, using the Default pubkey if not provided
        let fn_pubkey = Pubkey::from_str(&self.fn_key).map_err(|e| {
            ContainerError::Message(format!("failed to parse fn_key {}, {}", self.fn_key, e))
        })?;
        let fn_request_pubkey = get_pubkey(self.params.fn_request_key.clone());
        let mut payer_pubkey = get_pubkey(self.params.payer.clone());
        let mut reward_receiver_pubkey = get_pubkey(self.params.reward_receiver.clone());
        let mut verifier_pubkey = get_pubkey(self.params.verifier.clone());
        let mut queue_authority = get_pubkey(self.params.queue_authority.clone());
        let mut verifier_enclave_signer = get_pubkey(self.params.verifier_enclave_signer.clone());

        // then attempt to get the function account
        let fn_data_string = self.params.fn_data.clone().unwrap_or_default();
        let mut fn_data = if fn_data_string.is_empty() || fn_data_string.chars().all(|c| c == '0') {
            FunctionAccountData::default()
        } else {
            *bytemuck::try_from_bytes::<FunctionAccountData>(fn_data_string.as_bytes())
                .unwrap_or(&FunctionAccountData::default())
        };
        if fn_data == FunctionAccountData::default() {
            if let Ok(fn_account) = FunctionAccountData::fetch(&client, fn_pubkey).await {
                fn_data = fn_account;
            }
        }

        // attempt to get the function_request account if pubkey was provided
        let fn_request_data_string = self.params.fn_request_data.clone().unwrap_or_default();
        let mut fn_request_data = if fn_request_data_string.is_empty()
            || fn_request_data_string.chars().all(|c| c == '0')
        {
            FunctionRequestAccountData::default()
        } else {
            FunctionRequestAccountData::try_from_slice(fn_request_data_string.as_bytes())
                .unwrap_or_default()
        };
        if fn_request_data == FunctionRequestAccountData::default()
            && fn_request_pubkey != Pubkey::default()
        {
            fn_request_data = FunctionRequestAccountData::fetch(&client, fn_request_pubkey)
                .await
                .unwrap_or_default();
        }

        if queue_authority == Pubkey::default() {
            if let Ok(attestation_queue) =
                AttestationQueueAccountData::fetch(&client, fn_data.attestation_queue).await
            {
                queue_authority = attestation_queue.authority;

                if verifier_pubkey == Pubkey::default() {
                    if fn_data.queue_idx < attestation_queue.data_len {
                        verifier_pubkey = attestation_queue.data[fn_data.queue_idx as usize];
                    } else {
                        verifier_pubkey =
                            attestation_queue.data[attestation_queue.curr_idx as usize];
                    }
                }
            } else {
                return Err(Box::new(ContainerError::Message(format!(
                    "failed to fetch the functions attestation_queue {}",
                    fn_data.attestation_queue
                ))));
            }
        }

        // get the current verifier that should be running this function
        if verifier_pubkey == Pubkey::default() {
            match self.cluster {
                Cluster::Devnet => {
                    verifier_pubkey = get_pubkey(Some(
                        "2KgowxogBrGqRcgXQEmqFvC3PGtCu66qERNJevYW8Ajh".to_string(),
                    ))
                }
                Cluster::Mainnet => {
                    verifier_pubkey = get_pubkey(Some(
                        "Ddxj35NwVjKw1TBSJhqLvbo3my54B5GuKtahgKNWs7CM".to_string(),
                    ))
                }
                _ => {}
            };
        }

        if verifier_enclave_signer == Pubkey::default() {
            if let Ok(verifier_data) = VerifierAccountData::fetch(&client, verifier_pubkey).await {
                verifier_enclave_signer = verifier_data.enclave.enclave_signer;
            } else {
                return Err(Box::new(ContainerError::Message(format!(
                    "failed to fetch the verifiers account data {}",
                    verifier_pubkey
                ))));
            }
        }

        if payer_pubkey == Pubkey::default() {
            match self.cluster {
                Cluster::Devnet => {
                    payer_pubkey = get_pubkey(Some(
                        "2KgowxogBrGqRcgXQEmqFvC3PGtCu66qERNJevYW8Ajh".to_string(),
                    ))
                }
                Cluster::Mainnet => {
                    payer_pubkey = get_pubkey(Some(
                        "31Sof5r1xi7dfcaz4x9Kuwm8J9ueAdDduMcme59sP8gc".to_string(),
                    ))
                }
                _ => {}
            };
        }

        if reward_receiver_pubkey == Pubkey::default() && payer_pubkey != Pubkey::default() {
            reward_receiver_pubkey = find_associated_token_address(&payer_pubkey, &NativeMint);
        }

        let mut image_version = "latest".to_string();
        if let Some(version) = self.params.version.clone() {
            image_version = version;
        } else if fn_data.version != [0u8; 32] {
            image_version = String::from_utf8(fn_data.version.to_vec())
                .unwrap_or_default()
                .to_string();
        }
        image_version = image_version
            .chars()
            .filter(|c| c.is_ascii() && c != &'\u{0000}')
            .collect::<String>();

        let mut container_name = String::new();
        if let Some(container) = self.params.container.clone() {
            container_name = container;
        } else if fn_data.container != [0u8; 64] {
            container_name = String::from_utf8(fn_data.container.to_vec())
                .unwrap_or_default()
                .to_string();
        }
        container_name = container_name
            .chars()
            .filter(|c| c.is_ascii() && c != &'\u{0000}')
            .collect::<String>();

        let mut container_registry = "dockerhub".to_string();
        if let Some(registry) = self.params.container_registry.clone() {
            container_registry = registry;
        } else if fn_data.container_registry != [0u8; 64] {
            container_registry = String::from_utf8(fn_data.container_registry.to_vec())
                .unwrap_or_default()
                .to_string();
        }
        container_registry = container_registry
            .chars()
            .filter(|c| c.is_ascii() && c != &'\u{0000}')
            .collect::<String>();

        Ok(SolanaSimulate {
            cluster: self.cluster.clone(),

            image_name: format!("{}:{}", container_name, image_version),
            container_registry,

            env: SolanaFunctionEnvironment {
                function_key: fn_pubkey.to_string(),
                payer: payer_pubkey.to_string(),
                verifier: verifier_pubkey.to_string(),
                reward_receiver: reward_receiver_pubkey.to_string(),
                verifier_enclave_signer: pubkey_to_default(verifier_enclave_signer),
                queue_authority: pubkey_to_default(queue_authority),
                function_request_key: pubkey_to_default(fn_request_pubkey),
                function_data: if fn_data == FunctionAccountData::default() {
                    String::new()
                } else {
                    hex::encode(bytemuck::bytes_of(&fn_data))
                },
                function_request_data: if fn_request_data == FunctionRequestAccountData::default() {
                    String::new()
                } else {
                    hex::encode(fn_request_data.try_to_vec().unwrap())
                },
                cluster: self.cluster.to_string(),
            },
        })
    }
}

fn get_pubkey(pubkey: Option<String>) -> Pubkey {
    Pubkey::from_str(&pubkey.clone().unwrap_or(Pubkey::default().to_string()))
        .map_err(|e| {
            ContainerError::Message(format!(
                "failed to parse pubkey {}, {}",
                pubkey.clone().unwrap_or_default(),
                e
            ))
        })
        .unwrap()
}

fn pubkey_to_option(pubkey: Pubkey) -> Option<String> {
    if pubkey == Pubkey::default() {
        None
    } else {
        Some(pubkey.to_string())
    }
}

fn pubkey_to_default(pubkey: Pubkey) -> String {
    if pubkey == Pubkey::default() {
        String::new()
    } else {
        pubkey.to_string()
    }
}
