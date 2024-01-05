use near_sdk::json_types::{U128, U64};
use near_units::{parse_gas, parse_near};
use serde_json::json;
use workspaces::prelude::*;
use workspaces::result::CallExecutionDetails;
use workspaces::{network::Sandbox, Account, Contract, Worker};
use rand::Rng;
use switchboard::{
    OracleQueueInit, 
    SwitchboardDecimal,
    EscrowInit,
    ViewEscrow,
    ViewAllEscrows,
    Escrow,
    Uuid
};
use near_sdk::AccountId as NearAccountId;
use std::str::FromStr;
use bs58;

const SB_PATH: &str = "switchboard.wasm";
const FT_PATH: &str = "fungible_token.wasm";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let worker = workspaces::sandbox().await?;

    let sb_wasm = std::fs::read(SB_PATH)?;
    let sb_contract = worker.dev_deploy(&sb_wasm).await?;
    let ft_wasm = std::fs::read(FT_PATH)?;
    let ft_contract = worker.dev_deploy(&ft_wasm).await?;

    // create accounts
    let owner = worker.root_account().unwrap();
    let alice = owner
        .create_subaccount(&worker, "alice")
        .initial_balance(parse_near!("30 N"))
        .transact()
        .await?
        .into_result()?;

    println!("initializing token...");
    ft_contract
        .call(&worker, "new_default_meta")
        .args_json(serde_json::json!({
            "owner_id": owner.id(),
            "total_supply": parse_near!("1,000,000,000 N").to_string(),
        }))?
        .transact()
        .await?;
    println!("Token initialized!");

    println!("Initializing switchboard");
    let vault_id = rand::thread_rng().gen::<[u8; 32]>();
    sb_contract
        .call(&worker, "init")
        .args_json(serde_json::json!({
            "authority": owner.id(),
            "token_contract": ft_contract.id(),
            "token_vault": vault_id,
            // make it the same, for now.
            "governance_token_contract": ft_contract.id(),
        }))?
        .transact()
        .await?;

    let queue_id = rand::thread_rng().gen::<[u8; 32]>();
    let queue_init = OracleQueueInit {
        address: queue_id,
        authority: owner.id().as_str().to_string(),
        mint: ft_contract.id().as_str().to_string(),
        name: b"CoolQueue".to_vec(),
        metadata: b"".to_vec(),
        reward: 0u64,
        min_stake: 0u64,
        feed_probation_period: 0u32,
        oracle_timeout: 100u32,
        slashing_enabled: false,
        variance_tolerance_multiplier: SwitchboardDecimal{
            mantissa: 1i128,
            scale: 1,
        },
        consecutive_feed_failure_limit: 100u64,
        consecutive_oracle_failure_limit: 100u64,
        queue_size: 100u32,
        unpermissioned_feeds: false,
        unpermissioned_vrf: false,
        enable_buffer_relayers: false,
    };
    println!("initing a queue");
    sb_contract
        .call(&worker, "oracle_queue_init")
        .args_json(serde_json::json!({
            "ix": queue_init,
        }))?
        .transact()
        .await?;
    println!("made a queue");

    let escrow_seed = rand::thread_rng().gen::<[u8; 32]>();
    let escrow_init = EscrowInit {
        seed: escrow_seed,
        authority: ft_contract.id().as_str().to_string(),
        mint: ft_contract.id().as_str().to_string(),
    };
    println!("Making escrow");
    sb_contract
        .call(&worker, "escrow_init")
        .args_json(serde_json::json!({
            "ix": escrow_init,
        }))?
        .transact()
        .await?;

    let vescrow = ViewAllEscrows {};
    let json = serde_json::json!({
        "ix": vescrow,
    });
    let query: Vec<(Uuid, Escrow)> = sb_contract
        .call(&worker, "view_all_escrows")
        .args_json(json)?
        .transact()
        .await?
        .json()?;

    let u: Vec<Uuid> = query.iter().map(|r| r.0).collect();
    let escrow_id = u[0];
    let escrow_string = bs58::encode(escrow_id).into_string();

    println!("Depositing into escrow.");
    let json = serde_json::json!({
        "receiver_id": sb_contract.id(),
        "amount": parse_near!("1 N").to_string(),
        // Rust docs: from_utf8 is the inverse of String.as_bytes
        "msg": escrow_string,
    });

    owner
        .call(&worker, ft_contract.id(), "storage_deposit")
        .args_json(serde_json::json!({
            "account_id": owner.id()
        }))?
        .deposit(parse_near!("0.008 N"))
        .transact()
        .await?;
    owner
        .call(&worker, ft_contract.id(), "storage_deposit")
        .args_json(serde_json::json!({
            "account_id": sb_contract.id()
        }))?
        .deposit(parse_near!("0.008 N"))
        .transact()
        .await?;

    owner
        .call(&worker, ft_contract.id(), "ft_transfer")
        .args_json(json)?
        .deposit(1)
        .transact()
        .await?;
    println!("Deposited");

    let vescrow = ViewEscrow {
        address: escrow_id,
    };
    let json = serde_json::json!({
        "ix": vescrow,
    });
    println!("{}", json);
    let escrow_query: Escrow = sb_contract
        .call(&worker, "view_escrow")
        .args_json(json)?
        .transact()
        .await?
        .json()?;
    println!("Escrow: {:?}", escrow_query);

    Ok(())
}
