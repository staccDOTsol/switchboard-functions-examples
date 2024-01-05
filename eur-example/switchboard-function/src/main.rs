use std::collections::HashMap;

use crate::solana_sdk::commitment_config::CommitmentConfig;
use switchboard_solana::prelude::*;
use serde::{Serialize, Deserialize};
use switchboard_utils::FromStr;
use tokio;
use anchor_client::Client;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetArtistsParams {
    pub artists: [u8; 32],
}
impl InstructionData for SetArtistsParams {}
impl Discriminator for SetArtistsParams {
    fn discriminator() -> [u8; 8] {
        [0; 8]
    }

    const DISCRIMINATOR: [u8; 8] = [0; 8];
}
pub struct MyProgramState {
    pub bump: u8,
    pub authority: Pubkey,
    pub switchboard_function: Pubkey,
    pub _buffer: [u8; 512],
}

pub struct MyOracleState {
    pub bump: u8, 
    pub authority: Pubkey,
    pub top_spotify_artists: [u8; 32],
    pub _buffer: [u8; 512],

}
pub const PROGRAM_SEED: &[u8] = b"SPOTIFY_EXAMPLE";
pub const ORACLE_SEED: &[u8] = b"SPOTIFY_EXAMPLE_ORACLE";

pub const AUTHORITY: &str = "CaXvt6DsYGZevj7AmVd5FFYboyd8vLAEioPaQ7qbydMb";
pub const PROGRAM_ID: &str = "BUhaGyJbdbfV24BiW2GPjtqeUhkMZ2E9bYuu34pB8YEs";
pub const SECRET_NAME: &str = "jarettrsdunn@gmail.com";
fn to_u8_array(input: &str) -> [u8; 32] {
    let mut array = [0u8; 32];
    let bytes = input.as_bytes();
    let length = bytes.len().min(32); // Ensure that we don't exceed the array length
    array[..length].copy_from_slice(&bytes[..length]);
    array
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Response {
    pub limit: i32,
    pub next: Option<String>,
    pub offset: i32,
    pub previous: Option<String>,
    pub total: i32,
    pub items: Vec<ArtistObject>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArtistObject {
    pub external_urls: ExternalUrls,
    pub followers: Followers,
    pub genres: Vec<String>,
    pub href: String,
    pub id: String,
    pub images: Vec<ImageObject>,
    pub name: String,
    pub popularity: i32,
    pub r#type: String,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExternalUrls {
    // Add fields as per your requirement
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Followers {
    // Add fields as per your requirement
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageObject {
    // Add fields as per your requirement
}

#[derive(Debug, Deserialize)]
struct Tokens {
    access_token: String,
    token_type: String,
    scope: String,
    expires_in: u64,
    refresh_token: String,
}

#[switchboard_function]
pub async fn sb_function(
    runner: FunctionRunner,
    _: Vec<u8>,
) -> Result<Vec<Instruction>, SbFunctionError> {
    let program_id: Pubkey = Pubkey::from_str(PROGRAM_ID).unwrap();
    let sb_secrets = switchboard_solana::secrets::fetch_secrets(AUTHORITY, None)
    .await;
    if sb_secrets.is_err(){
        println!("error fetching secrets {:?}", sb_secrets.err());
        return Err(Error::FetchError.into());
    }
    let mut sb_secrets = sb_secrets.unwrap();
    let tokens = sb_secrets.keys.get(SECRET_NAME).unwrap().split("&").collect::<Vec<&str>>();
    let refresh_token = tokens.get(1).unwrap();
    let reqwest_client = reqwest::Client::new();

    let mut params = HashMap::new();
    params.insert("grant_type", "refresh_token");
    params.insert("refresh_token", refresh_token);
    params.insert("client_id", "23753b7f5e394a3bb9c3bce301ab7f93");

    let tokens = serde_json::from_str::<Tokens>(&reqwest_client.post("https://accounts.spotify.com/api/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .await.unwrap()
        .text()
        .await.unwrap()).unwrap();

    switchboard_solana::secrets::put_secret(AUTHORITY, SECRET_NAME, &format!("{}&{}", tokens.access_token, tokens.refresh_token), None).await.unwrap();

    let mut headers = reqwest::header::HeaderMap::new();
    headers
        .insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", tokens.access_token)).unwrap(),
        );
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        reqwest::header::HeaderValue::from_str("application/json").unwrap(),
    );
    let result = 
    serde_json::from_str::<Response>(
        &reqwest_client
        .get("https://api.spotify.com/v1/me/top/artists")
        .headers(headers.clone())
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap()
    ).unwrap();
    
    let spotify_artists = result.items
    .iter()
    .map(|artist| artist.name.clone())
    .collect::<Vec<String>>();

    let rpc_client: std::sync::Arc<solana_client::rpc_client::RpcClient> = runner.client;
    let null_keypair = Keypair::new();
let client = Client::new_with_options(
    Cluster::Custom(
        rpc_client.url().to_string(),
        rpc_client.url().to_string()),
    &null_keypair,
    CommitmentConfig::confirmed()
);

let program = client.program(program_id).unwrap();
let program_account = Pubkey::find_program_address(&[PROGRAM_SEED], &program_id).0;
let oracle_account = Pubkey::find_program_address(&[ORACLE_SEED, Pubkey::from_str(&AUTHORITY).unwrap().as_ref()], &program_id).0;
let switchboard_function = runner.function;
let enclave_signer = runner.signer;
let spotify_ixs = program
    .request()
    .accounts(vec![
        AccountMeta::new(program_account, false),
        AccountMeta::new_readonly(oracle_account, false),
        AccountMeta::new_readonly(switchboard_function, false),
        AccountMeta::new_readonly(enclave_signer, true),
    ])
    .args(SetArtistsParams {
        artists: to_u8_array(&spotify_artists.join(",")),
    })
    .instructions().unwrap();

    Ok(spotify_ixs)
}

#[sb_error]
pub enum Error {
    FetchError,
}