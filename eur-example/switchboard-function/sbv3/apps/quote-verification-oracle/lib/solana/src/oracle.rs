use crate::*;

use std::io::{Read, Write};
use std::{
    io::Cursor,
    result::Result,
    sync::Arc,
    time::{Duration, SystemTime},
};

use anchor_client::Cluster;
use tokio::signal::ctrl_c;

async fn init(
    client: Arc<RwLock<AnchorClient>>,
    rpc: Arc<RpcClient>,
    payer: &Keypair,
    verifier_pubkey: &Pubkey,
    secured_signer: Arc<RwLock<Keypair>>,
    queue: Pubkey,
) -> Result<(), SbError> {
    let secured_signer_pubkey = get_enclave_signer_pubkey(&secured_signer).await?;
    let quote = Gramine::generate_quote(&secured_signer_pubkey.to_bytes())?;

    let queue_data = AttestationQueueAccountData::fetch_async(rpc.as_ref(), queue).await?;

    println!("PERMISSION BUILD");
    let _permission_init_ix = AttestationPermissionInit::build_ix(
        queue,
        queue_data.authority,
        *verifier_pubkey,
        payer.pubkey(),
    )
    .unwrap();

    println!("ROTATE KEY");
    let ipfs = IPFSManager::new();
    let cid = ipfs
        .set_object(quote.clone())
        .await
        .map_err(|_| SbError::IpfsNetworkError)?;
    let cid = cid
        .from_base58()
        .map_err(|_| SbError::IpfsParseError)
        .unwrap()
        .to_vec();

    let mut registry_key = [0u8; 64];
    registry_key[0..cid.len()].clone_from_slice(&cid);

    let quote_rotate_ix = VerifierQuoteRotate::build_ix(
        verifier_pubkey,
        &payer.pubkey(),
        secured_signer_pubkey.as_ref(),
        &queue,
        registry_key,
    )
    .unwrap();

    let blockhash = rpc
        .get_latest_blockhash()
        .await
        .map_err(|_| SbError::Message("NetworkErr"))?;

    println!("TX BUILD");
    let tx = ix_to_tx(
        &[
            // permission_init_ix,
            quote_rotate_ix.clone(),
        ],
        &[&payer],
        blockhash,
    )?;

    println!("Rotating quote key..");
    let sig = rpc.send_and_confirm_transaction(&tx).await.unwrap();

    println!("Quote rotate signature {:?}", sig);
    Ok(())
}

pub fn load_enclave_secured_signer(keypair_path: &str) -> Result<Arc<Keypair>, SbError> {
    let file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(keypair_path);
    if file.is_err() {
        println!("Keypair file was unable to be opened, likely encrypted by a different enclave signature.");
        println!("Please move or delete before continuing: {}", keypair_path);
        return Err(SbError::InvalidKeypairFile);
    }
    let mut file = file.unwrap();
    let mut sealed_buffer_vec: Vec<u8> = Vec::with_capacity(64);
    let secured_signer: Keypair;
    let res = file.read_to_end(&mut sealed_buffer_vec);
    if res.is_ok() && sealed_buffer_vec.len() == 64 {
        println!("Secured signer already exists, loading..");
        secured_signer = Keypair::from_bytes(&sealed_buffer_vec).unwrap();
    } else {
        println!("Existing secured signer not found. Creating..");
        let mut seed = [0u8; 32];
        switchboard_solana::Gramine::read_rand(&mut seed)?;
        secured_signer = keypair_from_seed(&seed).unwrap();
        file.write_all(&secured_signer.to_bytes()[..64]).unwrap();
        drop(file);
    }
    Ok(Arc::new(secured_signer))
}

pub async fn start(program: Arc<anchor_client::Program<Arc<Keypair>>>) -> Result<(), SbError> {
    let env: &'static QvnEnvironment = get_qvn_env();
    let current_time = unix_timestamp();

    // load cluster config
    let url = env.rpc_url.clone();
    // will convert rpc_url to wss_url internally
    let cluster: Cluster = Cluster::from_str(url.as_str()).unwrap_or(Cluster::Custom(
        env.rpc_url.clone(),
        env.rpc_url.replace("https://", "wss"),
    ));
    let ws_url = cluster.ws_url().to_string();

    // load payer keypair
    let mut reader = Cursor::new(env.payer_secret.as_bytes());
    let payer = Arc::new(read_keypair(&mut reader).unwrap());
    println!("PAYER={}", payer.pubkey());

    // load enclave keypair
    let ss = load_enclave_secured_signer("/data/protected_files/keypair.bin")?;
    let secured_signer = Arc::new(RwLock::new(Keypair::from_bytes(&ss.to_bytes()).unwrap()));

    // Required print: Communicate verifier key to function manager
    println!("VERIFIER={}", env.quote_key);
    let verifier_pubkey = Pubkey::from_str(&env.quote_key).unwrap();

    // verify sgx quote and get mr_enclave from quote
    // https://is.gd/rrYMVM
    let quote = switchboard_solana::Gramine::generate_quote(
        &secured_signer.read().await.pubkey().to_bytes(),
    )?;
    ecdsa_quote_verification(&quote, current_time);
    let mr_enclave = sgx_quote::Quote::parse(&quote)
        .unwrap()
        .isv_report
        .mrenclave;
    println!("MR_ENCLAVE {}", hex::encode(mr_enclave));

    // load client, program, and rpc client
    let client = AnchorClient::new_with_options(
        cluster,
        ss,
        CommitmentConfig::processed(),
    );
    println!("log point2");
    let rpc = Arc::new(program.async_rpc());
    let client = Arc::new(RwLock::new(client));


    // fetch the verifier and attestation queue
    println!("fetch enclave {}", verifier_pubkey);
    let verifier_data = VerifierAccountData::fetch_async(&rpc, verifier_pubkey)
        .await
        .unwrap();
    let queue_data =
        AttestationQueueAccountData::fetch_async(&rpc, verifier_data.attestation_queue).await?;
    let _queue_authority = Arc::new(queue_data.authority);

    //////////////////////////////////////////////////////////////////////////
    /// Initialize the verifier oracle and set the enclave signer
    //////////////////////////////////////////////////////////////////////////
    let (msecured_signer, mpayer, mclient) =
        (secured_signer.clone(), payer.clone(), client.clone());
    let mrpc = rpc.clone();
    tokio::spawn(async move {
        init(
            mclient,
            mrpc,
            &mpayer,
            &verifier_pubkey,
            msecured_signer,
            verifier_data.attestation_queue,
        )
        .await
        .unwrap();
    })
    .await
    .unwrap();

    //////////////////////////////////////////////////////////////////////////
    /// Watch verifier oracle request events
    //////////////////////////////////////////////////////////////////////////
    println!("Setup Done. Starting heartbeats and event listeners..");
    let (msecured_signer, mpayer, mclient, mverifier_pubkey) = (
        secured_signer.clone(),
        payer.clone(),
        client.clone(),
        verifier_pubkey.clone(),
    );
    let h1 = tokio::spawn(async move {
        subscribe::<QuoteVerifyRequestEvent, _, _>(
            SWITCHBOARD_ATTESTATION_PROGRAM_ID,
            ws_url.as_str(),
            mclient.clone(),
            mverifier_pubkey.into(),
            msecured_signer,
            mpayer,
            on_verify_event,
        )
        .await;
    });

    //////////////////////////////////////////////////////////////////////////
    /// Start verifier oracle heartbeats
    //////////////////////////////////////////////////////////////////////////
    let (msecured_signer, mpayer, mclient) =
        (secured_signer.clone(), payer.clone(), client.clone());
    let h2 = tokio::spawn(async move {
        heartbeat_routine(
            program.clone(),
            mclient,
            &mpayer,
            verifier_pubkey,
            msecured_signer,
            verifier_data.attestation_queue,
        )
        .await;
    });

    //////////////////////////////////////////////////////////////////////////
    /// Watch for function verify events
    //////////////////////////////////////////////////////////////////////////
    let (_msecured_signer, _mpayer, _mclient, _mverifier_pubkey) = (
        secured_signer.clone(),
        payer.clone(),
        client.clone(),
        verifier_pubkey.clone(),
    );

    let reward_receiver = find_associated_token_address(&payer.pubkey(), &NativeMint::ID);

    let validator = Arc::new(FunctionResultValidator::new(
        client.clone(),
        rpc,
        payer.clone(),
        FunctionResultValidatorSigner::Production(secured_signer.clone()),
        &FunctionResultValidatorInitAccounts {
            verifier: verifier_pubkey,
            attestation_queue: verifier_data.attestation_queue,
            queue_authority: queue_data.authority,
            reward_receiver,
        },
        Box::new(ecdsa_quote_verification),
        None,
    ));
    let mvalidator = validator.clone();
    let h3 = tokio::spawn(async move {
        watch_function_verify_events(mvalidator.clone()).await;
    });
    tokio::try_join!(h1, h2, h3).unwrap();
    ctrl_c().await.unwrap();
    Ok(())
}
