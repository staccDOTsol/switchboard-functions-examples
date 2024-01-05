use crate::*;
use base64::{engine::general_purpose::STANDARD as b64, Engine as _};
use env::Env;
use ethers::core::rand::prelude::*;
use ethers::prelude::*;
use ethers::{
    core::types::{Address, Bytes},
    middleware::SignerMiddleware,
    providers::{Http, Middleware, Provider},
    signers::LocalWallet,
};

use coins_bip32::ecdsa::SigningKey;

use hex;
use ipfs::IPFSManager;
use sdk::Switchboard;
use sgx::Sgx;
use std::str::FromStr;
use std::{
    io::Read,
    io::Write,
    result::Result,
    sync::Arc,
    time::{Duration, SystemTime},
};
use tokio;
use tokio::runtime;

#[no_mangle]
pub extern "C" fn evm_start() {
    let rt = runtime::Builder::new_multi_thread()
        .enable_all()
        .worker_threads(4)
        .build()
        .unwrap();

    rt.block_on(async move {
        start().await.unwrap();
    });
}

pub async fn start() -> Result<(), Err> {
    Env::new().await;
    println!("{}", Env::get());
    let current_time = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs() as i64;

    let contract_address = &Env::get().CONTRACT_ADDRESS;
    let chain_id: u64 = Env::get().CHAIN_ID;
    let verifier_queue = &Env::get().QUEUE;
    let url = &Env::get().RPC_URL;
    let wss_url = &Env::get().WSS_URL;
    let heartbeat_interval = Env::get().HEARTBEAT_INTERVAL;

    let payer = &Env::get().PAYER_SECRET;
    let payer = hex::decode(payer).unwrap();
    let payer = LocalWallet::from_bytes(&payer).unwrap();
    let payer = payer.with_chain_id(chain_id);

    let enclave_id: &str = &Env::get().QUOTE_KEY;
    let enclave_id: Address = enclave_id.parse::<Address>().unwrap();

    println!("Payer id {:#?}", payer);

    println!("verifier_queue: {:?}", verifier_queue);
    let verifier_queue: Address = verifier_queue.parse::<Address>().unwrap();
    let keypair_path = "/data/protected_files/keypair.bin";
    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(keypair_path)
        .unwrap();
    let mut sealed_buffer_vec = Vec::with_capacity(64);
    let mut enclave_wallet: LocalWallet;
    let res = file.read_to_end(&mut sealed_buffer_vec);
    if res.is_ok() && sealed_buffer_vec.len() == 64 {
        println!("FILE EXISTS");
        enclave_wallet = LocalWallet::from_bytes(&sealed_buffer_vec).unwrap();
        enclave_wallet = enclave_wallet.with_chain_id(chain_id);
    } else {
        println!("File not found");
        let mut seed = [0u8; 32];
        Sgx::read_rand(&mut seed).map_err(|e| Err::SgxError)?;
        let mut rng = StdRng::from_seed(seed);
        enclave_wallet = LocalWallet::new(&mut rng);
        enclave_wallet = enclave_wallet.with_chain_id(chain_id);
        file.write_all(&enclave_wallet.signer().to_bytes()[..32])
            .unwrap();
        drop(file);
    }
    let enclave_wallet_address = enclave_wallet.address();
    println!("enclave wallet {:#?}", enclave_wallet_address);

    let ipfs_manager = IPFSManager::new();

    // Generate quote
    let quote = Sgx::gramine_generate_quote(&enclave_wallet.address().as_bytes())
        .map_err(|e| Err::SgxError)?;
    ecdsa_quote_verification(&quote, current_time.try_into().unwrap());
    let parsed_quote = sgx_quote::Quote::parse(&quote).unwrap();
    println!(
        "MR_ENCLAVE {}",
        b64.encode(parsed_quote.isv_report.mrenclave)
    );

    // // create and get data
    let cid = ipfs_manager.set_object(quote.clone()).await.unwrap();
    println!("QUOTE_CID {:?}", cid);

    // setup provider
    let provider = Provider::<Http>::try_from(url).unwrap();

    // Calculate the new gas price by adding a buffer to the base fee per gas
    // set up payer contract for node initialization and permissions
    println!("PAYER: {:#?}", payer.address());
    let payer_client: SignerMiddleware<Provider<Http>, Wallet<SigningKey>> =
        SignerMiddleware::new(provider.clone(), payer.clone());
    let contract_address = H160::from_str(&contract_address).unwrap();
    let payer_contract = Switchboard::new(contract_address, payer_client.clone().into());

    // setup contract with enclave_wallet as payer too
    let client = SignerMiddleware::new(provider.clone(), enclave_wallet.clone());
    let client = Arc::new(client);
    let contract = Switchboard::new(contract_address, client);

    // get node balance
    let balance = payer_client
        .provider()
        .get_balance(payer.address(), None)
        .await
        .unwrap(); // if the call fails, just don't update

    println!("BALANCE: {}", balance);

    // collect transactions for initialization
    let mut startup_txs = Vec::new();

    // enable enclave wallet to use switchboard contract
    let mut enable_enclave_wallet_permissions =
        contract.set_allowed(enclave_wallet.address(), true);
    enable_enclave_wallet_permissions
        .tx
        .set_from(payer.address());
    startup_txs.push(enable_enclave_wallet_permissions);

    // startup tx transaction expiration (90 seconds in the future)
    let startup_txs_expiration_time_seconds = current_time + 90;

    let mut rotate_enclave_signer =
        contract.rotate_enclave_signer(enclave_id, enclave_wallet.address());

    rotate_enclave_signer.tx.set_from(payer.address());
    startup_txs.push(rotate_enclave_signer);

    // ===
    // set permissions
    // - with the payer key being the node authority
    // - enable heartbeat permissions - granted to Node Address
    //
    let hb_permission = 1 << 0;
    let mut set_hb_permission = payer_contract.set_attestation_queue_permission(
        verifier_queue,
        enclave_id,
        hb_permission.into(),
        true,
    );
    set_hb_permission.tx.set_from(payer.address());
    startup_txs.push(set_hb_permission);

    // ===
    // update the enclave's quote data
    //
    let vq = contract
        .attestation_queues(verifier_queue)
        .call()
        .await
        .unwrap();

    let mut update_enclave = contract
        .update_enclave(enclave_id, Bytes::from(cid.as_bytes().to_vec()))
        .value(vq.reward);
    update_enclave.tx.set_from(enclave_wallet.address());

    // add update enclave call
    startup_txs.push(update_enclave);

    // add mr enclave if it doesnt't exist
    let has_mr_enclave = contract
        .attestation_queue_has_mr_enclave(
            verifier_queue,
            parsed_quote.isv_report.mrenclave.try_into().unwrap(),
        )
        .call()
        .await
        .unwrap();
    if !has_mr_enclave {
        let mut add_mr_enclave = payer_contract.add_mr_enclave_to_attestation_queue(
            verifier_queue,
            parsed_quote.isv_report.mrenclave.try_into().unwrap(),
        );
        add_mr_enclave.tx.set_from(payer.address());

        // add mrenclave tx
        startup_txs.push(add_mr_enclave);
    }

    // ===
    // as payer node try to force override the quote verification (handle failure / ignore it)
    //
    let mut startup_txs_with_force_override = startup_txs.clone();

    // get startup txs pushed
    let mut force_override_verify = payer_contract.force_override_verify(enclave_id);
    force_override_verify.tx.set_from(payer.address());
    startup_txs_with_force_override.push(force_override_verify);

    let enclave_wallet_address = enclave_wallet.address();
    let init_tx_expiration = current_time + 300;

    // forward
    let mut init_tx_with_force_override = forward(
        payer_contract.clone(),
        enclave_wallet.clone(),
        enclave_wallet_address,
        startup_txs_with_force_override.clone(),
        init_tx_expiration.try_into().unwrap(),
        balance, // @TODO: gas limit max  - maybe fix this so it's not the whole balance
    )
    .unwrap();
    init_tx_with_force_override.tx.set_from(payer.address());

    // handle simulation
    let force_override_simulation = init_tx_with_force_override.estimate_gas().await;

    // Run Metatransaction simulation with force override (run without if it fails)
    if force_override_simulation.is_err() {
        println!(
            "FORCE OVERRIDE FAILED: {:#?}",
            force_override_simulation.err()
        );
        // if the meta tx run can't force override, skip it
        let init_tx = forward(
            payer_contract.clone(),
            enclave_wallet.clone(),
            enclave_wallet_address,
            startup_txs,
            startup_txs_expiration_time_seconds.try_into().unwrap(),
            balance, // gas limit max
        )
        .unwrap();

        let gas = init_tx.estimate_gas().await.unwrap();
        let tx_hash = init_tx
            .gas(gas)
            .send()
            .await
            .unwrap()
            .log_msg("Initialization")
            .await
            .unwrap()
            .unwrap()
            .transaction_hash;
        println!("INIT_TX: {:?}", tx_hash);
    } else {
        println!("FORCE OVERRIDE SUCCESS");
        // run the metatx with the force override
        let init_tx = forward(
            payer_contract.clone(),
            enclave_wallet.clone(),
            enclave_wallet_address,
            startup_txs_with_force_override,
            startup_txs_expiration_time_seconds.try_into().unwrap(),
            balance, // gas limit max
        )
        .unwrap();

        let gas = init_tx.estimate_gas().await.unwrap();

        // if it's not an error, then we can force override (probably)
        let tx_hash = init_tx
            .gas(gas)
            .send()
            .await
            .unwrap()
            .log_msg("Initialization")
            .await
            .unwrap()
            .unwrap()
            .transaction_hash;
        println!("OVERRIDE_TX: {:?}", tx_hash);
    }

    // ===
    //  ROUTINE SETUP

    let latest_block = contract.client().get_block_number().await.unwrap();
    println!("Latest block num {}", latest_block);

    let heartbeat_contract = payer_contract.clone();
    let heartbeat_enclave_wallet = enclave_wallet.clone();
    let heartbeat_enclave_address = enclave_id.clone();

    let function_enclave_wallet = enclave_wallet.clone();
    let function_verifier_address = enclave_wallet.address();
    let function_enclave_key = enclave_id.clone();

    // Define your heartbeat and subscription routines
    let rt = tokio::runtime::Handle::current();
    let hb_handle = tokio::spawn(heartbeat_routine(
        heartbeat_contract,
        heartbeat_enclave_wallet,
        heartbeat_enclave_address,
        heartbeat_interval,
    ));

    // Function routine
    let mcontract = payer_contract.clone();
    let func_handle = tokio::spawn(async move {
        watch_function_verify_events(
            mcontract,
            contract_address,
            function_enclave_wallet,
            Arc::new(function_verifier_address),
            Arc::new(function_enclave_key),
        )
        .await;
    });

    println!("Awaiting routines");

    let use_wss_event_listener: bool = wss_url != "";
    if use_wss_event_listener {
        // build websocket contract
        println!("WSS URL: {}", wss_url);
        let provider = Provider::<Ws>::connect(wss_url).await.unwrap();
        let client = SignerMiddleware::new(provider.clone(), payer.clone());
        let client = Arc::new(client);
        let contract = Switchboard::new(contract_address, client);
        rt.spawn_blocking(move || async move {
            subscribe_to_verify_event(
                contract,
                enclave_wallet,
                enclave_id,
                latest_block.as_u64(),
                ipfs_manager,
            )
            .await
        })
        .await
        .unwrap()
        .await
        .unwrap();
    } else {
        rt.spawn_blocking(move || async move {
            subscribe_to_verify_event(
                contract,
                enclave_wallet,
                enclave_id,
                latest_block.as_u64(),
                ipfs_manager,
            )
            .await
        })
        .await
        .unwrap()
        .await
        .unwrap();
    };
    hb_handle.await.unwrap();
    func_handle.await.unwrap();

    Ok(())
}
