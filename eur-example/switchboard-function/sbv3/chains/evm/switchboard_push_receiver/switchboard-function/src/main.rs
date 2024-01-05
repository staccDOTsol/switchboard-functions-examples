pub mod coinbase;
pub use coinbase::*;
pub mod binance;
pub use binance::*;
pub mod bitfinex;
pub use bitfinex::*;
pub mod kraken;
pub use kraken::*;
pub mod bittrex;
pub use bittrex::*;
pub mod gateio;
pub use gateio::*;
pub mod huobi;
pub use huobi::*;
pub mod kucoin;
pub use kucoin::*;
pub mod okx;
pub use okx::*;
pub mod bitstamp;
pub use bitstamp::*;
pub mod poloniex;
pub use poloniex::*;
pub mod pair;
pub use pair::*;

use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use serde::Deserialize;
use std::collections::HashMap;
pub use std::result::Result;
use switchboard_common;
use switchboard_evm::sdk::EvmFunctionRunner;
use switchboard_evm::*;
pub use switchboard_utils::reqwest;
pub use switchboard_utils::reqwest::Error;

use ethers::{
    prelude::{abigen, SignerMiddleware},
    providers::{Http, Provider},
    types::I256,
};
use rand;
use rand::seq::SliceRandom;
use rand::SeedableRng;
use std::time::SystemTime;
use tokio::time::{timeout, Duration};

#[allow(non_snake_case)]
#[derive(Deserialize, Default, Clone, Debug)]
pub struct NormalizedTicker {
    pub price: Decimal,
}
#[allow(non_snake_case)]
#[derive(Deserialize, Default, Clone, Debug)]
pub struct NormalizedOrdersRow {
    price: Decimal,
    amount: Decimal,
}
#[allow(non_snake_case)]
#[derive(Deserialize, Default, Clone, Debug)]
pub struct NormalizedBook {
    pub bids: Vec<NormalizedOrdersRow>,
    pub asks: Vec<NormalizedOrdersRow>,
    pub price: Decimal,
}
#[derive(Debug, Clone)]
enum Sample {
    Binance(BinanceSpot),
    Bitfinex(BitfinexPair),
    Bitstamp(BitstampTicker),
    Bittrex(BittrexPair),
    // Coinbase(CoinbaseBook),
    GateIo(GateIoPair),
    Huobi(HuobiTicker),
    Kraken(KrakenTickerInfo),
    Kucoin(KucoinTicker),
    Okex(OkexTicker),
    Poloniex(PoloniexTicker),
    CoinbaseSpot(Decimal),
}

impl Into<NormalizedTicker> for Sample {
    fn into(self) -> NormalizedTicker {
        match self {
            Sample::Binance(t) => t.into(),
            Sample::Bitfinex(t) => t.into(),
            Sample::Bitstamp(t) => t.into(),
            Sample::Bittrex(t) => t.into(),
            Sample::GateIo(t) => t.into(),
            Sample::Huobi(t) => t.into(),
            Sample::Kraken(t) => t.into(),
            Sample::Kucoin(t) => t.into(),
            Sample::Okex(t) => t.into(),
            Sample::Poloniex(t) => t.into(),
            // Sample::Coinbase(t) => t.into(),
            Sample::CoinbaseSpot(t) => {
                let mut res = NormalizedTicker::default();
                res.price = t;
                res
            }
        }
    }
}

// define the abi for the callback
// -- here it's just a function named "callback", expecting the feed names, values, and timestamps
// -- we also include a view function for getting all feeds
// running `npx hardhat typechain` will create artifacts for the contract
// this in particular is found at
// SwitchboardPushReceiver/artifacts/contracts/src/SwitchboardPushReceiver/Receiver/Receiver.sol/Receiver.json
abigen!(Receiver, "./src/abi/Receiver.json",);

static CLIENT_URL: &str = "https://switchbo-switchbo-1652.mainnet.arbitrum.rpcpool.com/ffc1b5b6-bb04-4334-ac89-1034cd57e86e";
static RECEIVER: &str = env!("SWITCHBOARD_PUSH_ADDRESS");

#[sb_error]
enum SbError {
    ParseError = 1,
    FetchError,
}

// Define the Switchboard Function - resulting in a vector of tx's to be sent to the contract
#[sb_function(expiration_seconds = 120, gas_limit = 5_500_000)]
async fn sb_function(
    client: SbMiddleware,
    _: Address,
    _: NoParams,
) -> Result<Vec<FnCall>, SbError> {
    println!("Running Switchboard Function");
    // get the receiver contract
    let receiver: Address = RECEIVER.parse().map_err(|_| SbError::ParseError)?;
    let receiver_contract = Receiver::new(receiver, client.into());

    // get time in seconds
    let current_time = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // get all feeds
    let feeds = receiver_contract.get_all_feeds().call().await.unwrap_or_default();


    // take feed.feed_name and map it to feed.latest_result
    let mut feed_map = HashMap::<[u8; 32], I256>::new();
    for feed in feeds {
        feed_map.insert(feed.feed_name, feed.latest_result.value);
    }

    // get fresh feed data
    let mut feed_updates = get_feed_data().await;

    // check if we're still registering feeds (significantly more expensive in gas cost)
    // -- if so, only use the first 20 elements of the feed_updates
    // allow up to 1 registration alongside updates so we don't block updates for an entire run if a feed is added
    let registering_feeds: bool = feed_map.len() < feed_updates.len() - 1;

    // get list of feed names that weren't received in get_feed_data
    let mut missing_feeds = Vec::<[u8; 32]>::new();
    for key in feed_map.keys() {
        // add if the feed_updates doesn't contain the key and length < 10
        if !feed_updates.contains_key(key) && missing_feeds.len() < 10 {
            missing_feeds.push(*key);
        }
    }

    // delete all entries with a diff less than 0.1
    for (key, value) in feed_updates.clone() {
        if feed_map.contains_key(&key) {
            let diff = get_percentage_diff(*feed_map.get(&key).unwrap(), value);
            // %0.01 diff should triger an update
            if registering_feeds || diff < Decimal::from_str("0.1").unwrap() {
                feed_updates.remove(&key);
            }
        }
    }

    // get a vec of feed names and values remaining
    let mut feed_names = Vec::<[u8; 32]>::new();
    let mut feed_values = Vec::<I256>::new();

    // setup feeds for shuffling
    let mut randomness = [0; 32];
    Gramine::read_rand(&mut randomness).unwrap();
    let mut rng = rand::rngs::StdRng::from_seed(randomness);
    let mut feed_updates: Vec<([u8; 32], I256)> = feed_updates.into_iter().collect();

    // only shuffle feeds if we're at the stage where we're submitting results
    if !registering_feeds {
        feed_updates.shuffle(&mut rng);
    }

    for (key, value) in feed_updates {
        // only use the first 30 elements of the feed_updates
        // -- this is to prevent the transaction from going over the gas limit
        if feed_names.len() >= 20 && registering_feeds {
            break;
        }
        if feed_names.len() >= 50 && !registering_feeds {
            break;
        }
        feed_names.push(key);
        feed_values.push(value);
    }

    // send the callback to the contract
    let callback =
        receiver_contract.callback(feed_names.clone(), feed_values.clone(), current_time.into());

    // get the calls from the output results
    let mut callbacks = vec![callback];

    // add the missing feeds to the callback to mark them as stale
    if !registering_feeds && missing_feeds.len() > 0 {
        let callback_missing_feeds = receiver_contract.failure_callback(missing_feeds.clone());
        callbacks.push(callback_missing_feeds);
    }

    // Return the Vec of callbacks to be run by the Switchboard Function on-chain
    Ok(callbacks)
}

// Get all feed data from various exchanges and return a hashmap of feed names and medianized values
async fn get_feed_data() -> HashMap<[u8; 32], I256> {
    use crate::Sample::*;
    let to = Duration::from_secs(5);
    let empty_vec: Vec<Sample> = Vec::new();
    let mut aggregates = HashMap::<Pair, Vec<Sample>>::new();
    let binance_spot = timeout(to, tokio::spawn(fetch_binance_spot()));
    let bitfinex_spot = timeout(to, tokio::spawn(fetch_bitfinex_spot()));
    let bitstamp_spot = timeout(to, tokio::spawn(fetch_bitstamp_spot()));
    let bittrex_spot = timeout(to, tokio::spawn(fetch_bittrex_spot()));
    // let coinbase_spot = timeout(to, tokio::spawn(fetch_coinbase_spot()));
    // let gateio_spot = timeout(to, tokio::spawn(fetch_gateio_spot()));
    // let huobi_spot = timeout(to, tokio::spawn(fetch_huobi_spot()));
    // let kraken_spot = timeout(to, tokio::spawn(fetch_kraken_spot()));
    // let kucoin_spot = timeout(to, tokio::spawn(fetch_kucoin_spot()));
    // let okex_spot = timeout(to, tokio::spawn(fetch_okex_spot()));
    // let poloniex_spot = timeout(to, tokio::spawn(fetch_poloniex_spot()));
    // println!("Binance markets {:#?}", binance_spot);
    if let Ok(Ok(Ok(binance_spot))) = binance_spot.await {
        for p in binance_spot {
            let mut samples: Vec<_> = aggregates.get(&p.symbol).unwrap_or(&empty_vec).to_vec();
            samples.push(Binance(p.clone()));
            aggregates.insert(p.symbol, samples.clone());
        }
    } else {
        println!("Error: Binance fetch failure");
    }

    // println!("Bitfinex martkets {:#?}", bitfinex_spot);
    if let Ok(Ok(Ok(bitfinex_spot))) = bitfinex_spot.await {
        for p in bitfinex_spot {
            let mut samples = aggregates.get(&p.symbol).unwrap_or(&empty_vec).to_vec();
            samples.push(Bitfinex(p.clone()));
            aggregates.insert(p.symbol, samples.to_vec());
        }
    } else {
        println!("Error: Bitfinex fetch failure");
    }

    // println!("Bitstamp markets {:#?}", bitstamp_spot);
    if let Ok(Ok(Ok(bitstamp_spot))) = bitstamp_spot.await {
        for p in bitstamp_spot {
            let mut samples = aggregates.get(&p.pair).unwrap_or(&empty_vec).to_vec();
            samples.push(Bitstamp(p.clone()));
            aggregates.insert(p.pair, samples.to_vec());
        }
    } else {
        println!("Error: Bitstamp fetch failure");
    }

    // println!("Bittrex markets {:#?}", bittrex_spot);
    if let Ok(Ok(Ok(bittrex_spot))) = bittrex_spot.await {
        for p in bittrex_spot {
            let mut samples = aggregates.get(&p.symbol).unwrap_or(&empty_vec).to_vec();
            samples.push(Bittrex(p.clone()));
            aggregates.insert(p.symbol, samples.to_vec());
        }
    } else {
        println!("Error: Bittrex fetch failure");
    }
//
    // if let Ok(Ok(Ok(coinbase_spot))) = coinbase_spot.await {
        // for (symbol, v) in coinbase_spot {
            // let mut samples = aggregates.get(&symbol).unwrap_or(&empty_vec).to_vec();
            // samples.push(CoinbaseSpot(v.clone()));
            // aggregates.insert(symbol, samples.to_vec());
        // }
    // } else {
        // println!("Error: Coinbase fetch failure");
    // }
//
    // // println!("Gateio markets {:#?}", gateio_spot);
    // if let Ok(Ok(Ok(gateio_spot))) = gateio_spot.await {
        // for p in gateio_spot {
            // let mut samples = aggregates
                // .get(&p.currency_pair)
                // .unwrap_or(&empty_vec)
                // .to_vec();
            // samples.push(GateIo(p.clone()));
            // aggregates.insert(p.currency_pair, samples.to_vec());
        // }
    // } else {
        // println!("Error: Gateio fetch failure");
    // }
//
    // //println!("Huobi markets {:#?}", huobi_spot.data);
    // if let Ok(Ok(Ok(huobi_spot))) = huobi_spot.await {
        // for p in huobi_spot.data {
            // let mut samples = aggregates.get(&p.symbol).unwrap_or(&empty_vec).to_vec();
            // samples.push(Huobi(p.clone()));
            // aggregates.insert(p.symbol, samples.to_vec());
        // }
    // } else {
        // println!("Error: Huobi fetch failure");
    // }
//
    // // println!("Kraken markets {:#?}", kraken_spot.result);
    // if let Ok(Ok(Ok(kraken_spot))) = kraken_spot.await {
        // for (k, v) in kraken_spot.result {
            // let mut samples = aggregates.get(&k).unwrap_or(&empty_vec).to_vec();
            // samples.push(Kraken(v.clone()));
            // aggregates.insert(k, samples.to_vec());
        // }
    // } else {
        // println!("Error: Kraken fetch failure");
    // }
//
    // // println!("Kucoin markets {:#?}", kucoin_spot.data.ticker);
    // if let Ok(Ok(Ok(kucoin_spot))) = kucoin_spot.await {
        // for p in kucoin_spot.data.ticker {
            // let mut samples = aggregates.get(&p.symbol).unwrap_or(&empty_vec).to_vec();
            // samples.push(Kucoin(p.clone()));
            // aggregates.insert(p.symbol, samples.to_vec());
        // }
    // } else {
        // println!("Error: Kucoin fetch failure");
    // }
//
    // // println!("okex markets {:#?}", okex_spot.data);
    // if let Ok(Ok(Ok(okex_spot))) = okex_spot.await {
        // for p in okex_spot.data {
            // let mut samples = aggregates.get(&p.instId).unwrap_or(&empty_vec).to_vec();
            // samples.push(Okex(p.clone()));
            // aggregates.insert(p.instId, samples.to_vec());
        // }
    // } else {
        // println!("Error: Okex fetch failure");
    // }

    // println!("Bitstamp markets {:#?}", bitstamp_spot);
    // if let Ok(Ok(Ok(poloniex_spot))) = poloniex_spot.await {
        // for (symbol, v) in poloniex_spot.into_inner() {
            // let mut samples = aggregates.get(&symbol).unwrap_or(&empty_vec).to_vec();
            // samples.push(Poloniex(v.clone()));
            // aggregates.insert(symbol, samples.to_vec());
        // }
    // } else {
        // println!("Error: Poloniex fetch failure");
    // }
    // Only retain more than 2 samples
    aggregates.retain(|k, v| v.len() > 2 && k.quote.contains("USD"));
    // println!("{:#?}", aggregates);
    // println!("{:#?}", aggregates.len());

    let mut feed_map = HashMap::<[u8; 32], I256>::new();

    // go through each pair and calculate the average
    for (k, v) in aggregates {
        let _sum = 0.0;

        // get the median price
        let mut prices: Vec<Decimal> = v
            .iter()
            .map(|x| {
                let normalized: NormalizedTicker = (*x).clone().into();
                normalized.price
            })
            .collect();
        prices.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let mut median: Decimal;

        // handle even and odd cases
        if prices.len() % 2 == 0 {
            let mid = prices.len() / 2;
            median = (prices[mid] + prices[mid - 1]) / Decimal::from(2);
        } else {
            median = prices[prices.len() / 2];
        }

        // get pair name as string
        let name = format!("{}/{}", k.base, k.quote);
        println!("{} -> {}", name, median);

        // get mean
        let sum: Decimal = prices.iter().sum();
        let count = Decimal::from(prices.len() as i32);
        let mean = sum / count;

        // get variance
        let squared_deviations: Decimal = prices.iter().map(|&x| (x - mean).powi(2)).sum();
        let variance = squared_deviations / count;

        // get standard deviation
        let std_dev = variance.sqrt().unwrap();

        // filter out prices that are not within 1 std dev of the mean
        let prices = if prices.len() > 3 {
            prices
                .iter()
                .filter(|&x| {
                    let lower_bound = median - std_dev;
                    let upper_bound = median + std_dev;
                    let x_is_in_range = *x >= lower_bound && *x <= upper_bound;
                    // for debugging:
                    // if !x_is_in_range {
                    //     // get index in prices
                    //     println!("Feed Name {},  {} is not in range {} - {}", name, x, lower_bound, upper_bound);
                    // }
                    x_is_in_range
                })
                .map(|x| *x)
                .collect()
        } else {
            prices
        };
        if prices.len() == 0 {
            continue;
        }

        // recalculate median
        if prices.len() % 2 == 0 {
            let mid = prices.len() / 2;
            median = (prices[mid] + prices[mid - 1]) / Decimal::from(2);
        } else {
            median = prices[prices.len() / 2];
        }

        // add to vectors
        let mut bytes32 = [0u8; 32];
        bytes32[..name.as_bytes().len()].copy_from_slice(name.as_bytes());

        // get median with fixed decimals at 18 as I256
        median.rescale(18);
        let median = I256::from(median.mantissa());

        // add to map
        feed_map.insert(bytes32, median);
    }

    // return the medians and names
    feed_map
}

fn get_percentage_diff(a: I256, b: I256) -> Decimal {
    let a = Decimal::from(a.as_i128());
    let b = Decimal::from(b.as_i128());
    let divisor = Decimal::max(a, b);
    if divisor == Decimal::from(0) {
        return a.abs();
    }
    (Decimal::min(a, b) / divisor).abs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test() {
        let feed_map = get_feed_data().await;
        println!("{:?}", feed_map);
    }
}
