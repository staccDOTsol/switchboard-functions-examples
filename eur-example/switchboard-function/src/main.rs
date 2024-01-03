use crate::solana_sdk::commitment_config::CommitmentConfig;
use futures::future::join_all;
use rust_decimal::Decimal;
use std::boxed::Box;
use std::pin::Pin;
use switchboard_solana::prelude::*;
use switchboard_utils::task::http_task;
use switchboard_utils::utils::median;
use switchboard_utils::FromStr;
use tokio;

fn to_u8_array(input: &str) -> [u8; 32] {
    let mut array = [0u8; 32];
    let bytes = input.as_bytes();
    let length = bytes.len().min(32); // Ensure that we don't exceed the array length
    array[..length].copy_from_slice(&bytes[..length]);
    array
}

pub async fn fetch_all<T, E>(
    v: Vec<Pin<Box<impl Future<Output = Result<T, E>>>>>,
) -> Result<Vec<T>, E> {
    join_all(v).await.into_iter().collect()
}

pub async fn fetch_price() -> Result<Decimal, Box<dyn std::error::Error>> {
    let futures: Vec<_> = vec![
        Box::pin(http_task("https://api.exchangeratesapi.io/v1/latest?access_key=dd4a59e3a67c336dc4c06e1a8265190c&base=EUR", Some("$.rates.USD"))),
        Box::pin(http_task("https://v6.exchangerate-api.com/v6/769ac8b9ef23e9c001b9c53e/latest/EUR", Some("$.conversion_rates.USD"))),
        Box::pin(http_task("https://api.fastforex.io/fetch-one?from=EUR&to=USD&api_key=2ebd46374f-5958df7e94-s6nz5u", Some("$.result.USD"))),
    ];
    let responses: Vec<Option<Decimal>> = fetch_all(futures)
        .await?
        .into_iter()
        .map(|x| Decimal::from_str(&x.to_string()).ok())
        .collect();
    println!("responses: {:?}", responses);
    Ok(median(responses.into_iter().filter_map(|x| x).collect()))
}

#[switchboard_function]
pub async fn sb_function(
    runner: FunctionRunner,
    _: Vec<u8>,
) -> Result<Vec<Instruction>, SbFunctionError> {
    let price = fetch_price().await.map_err(|_| Error::FetchError)?;
    let price_ix = runner.upsert_feed(&to_u8_array("EUR_USD"), price);
    Ok(vec![price_ix.1])
}

#[sb_error]
pub enum Error {
    FetchError,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_exchange_rates() {
        fetch_price().await.unwrap();
    }
}
