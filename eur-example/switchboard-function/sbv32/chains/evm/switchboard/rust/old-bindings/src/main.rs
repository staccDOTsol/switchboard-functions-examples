#![allow(unused)]

use ethers::{
    prelude::{abigen, Abigen},
    providers::{Http, Provider},
    solc::Solc,
    types::Address,
};
use eyre::Result;
use std::sync::Arc;
use std::fs;

use tokio::main;

#[derive(Clone, Debug, PartialEq)]
pub enum Err {
    Generic,
    BuilderFailure,
    GenerationFailure,
    WriteFailure,
    CompileFailure
}

#[tokio::main]
async fn main() -> Result<(), Err> {
    rust_file_generation()?;
    Ok(())
}

fn rust_file_generation() -> Result<(), Err> {
    let json_contents = fs::read_to_string("../../artifacts/hardhat-diamond-abi/HardhatDiamondABI.sol/Switchboard.json")
        .unwrap();

    Abigen::new("Switchboard", &json_contents)
        .unwrap()
        .generate()
        .unwrap()
        .write_to_file(format!("./bindings/{}.rs", "Switchboard"))
        .map_err(|_| Err::WriteFailure)?;
    
    Ok(())
}
