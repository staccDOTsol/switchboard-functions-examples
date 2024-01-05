use crate::solana_sdk::commitment_config::CommitmentConfig;
use futures::future::join_all;
use rust_decimal::Decimal;
use std::boxed::Box;
use std::pin::Pin;
use switchboard_solana::prelude::*;
use switchboard_utils::task::http_task;
use switchboard_utils::utils::median;
use switchboard_utils::FromStr;
use serde::{Serialize, Deserialize};
use tokio;

fn to_u8_array(input: &str) -> [u8; 32] {
    let mut array = [0u8; 32];
    let bytes = input.as_bytes();
    let length = bytes.len().min(32); // Ensure that we don't exceed the array length
    array[..length].copy_from_slice(&bytes[..length]);
    array
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Response {
    pub string: String,
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

#[switchboard_function]
pub async fn sb_function(
    runner: FunctionRunner,
    _: Vec<u8>,
) -> Result<Vec<Instruction>, SbFunctionError> {
    let sb_secrets = switchboard_solana::secrets::fetch_secrets("CaXvt6DsYGZevj7AmVd5FFYboyd8vLAEioPaQ7qbydMb", None)
    .await;
    if sb_secrets.is_err(){
        return Err(Error::FetchError.into());
    }
    let sb_secrets = sb_secrets.unwrap();
    let auth_token = sb_secrets.keys.get("jarettrsdunn@gmail.com");
    let mut headers = reqwest::header::HeaderMap::new();
    headers
        .insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", auth_token.unwrap())).unwrap(),
        );

    let result = reqwest::Client::new()
        .get("https://api.spotify.com/v1/me/top/artists")
        .headers(headers)
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();

    let response: Response = serde_json::from_str(&result).unwrap();
    let spotify_artists = response.items
    .iter()
    .map(|artist| artist.name.clone())
    .collect::<Vec<String>>();

    let saved: Decimal = Decimal::from_str(&format!("{}", spotify_artists.len())).unwrap();
    let spotify_ix = runner.upsert_feed(&to_u8_array("stacc's top spotify artists"), saved);

    println!("spotify feed key: {:?}", spotify_ix.0);
    println!("spotify feed values: {:?}", spotify_ix.1);

    Ok(vec![spotify_ix.1])
}

#[sb_error]
pub enum Error {
    FetchError,
}