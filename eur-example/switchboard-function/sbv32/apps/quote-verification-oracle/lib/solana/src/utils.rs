use crate::*;

pub fn to_seed_refs(v: &Vec<Vec<u8>>) -> Vec<&[u8]> {
    let mut out = Vec::with_capacity(v.len());
    for item in v {
        out.push(item.as_ref());
    }
    out
}

pub fn ix_to_tx(
    ixs: &[Instruction],
    signers: &[&Keypair],
    blockhash: Hash,
) -> Result<Transaction, SbError> {
    let msg = Message::new(ixs, Some(&signers[0].pubkey()));
    let mut tx = Transaction::new_unsigned(msg);
    tx.try_sign(&signers.to_vec(), blockhash)
        .map_err(|e| SbError::SolanaSignError(Arc::new(e), "Keypair likely rotated".into()))?;
    Ok(tx)
}

pub fn build_ix<A: ToAccountMetas, I: InstructionData + Discriminator>(
    accounts: A,
    params: I,
) -> Instruction {
    Instruction {
        program_id: SWITCHBOARD_ATTESTATION_PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: params.data(),
    }
}

pub fn build_tx<A: ToAccountMetas, I: InstructionData + Discriminator>(
    anchor_client: &anchor_client::Client<Arc<Keypair>>,
    accounts: A,
    params: I,
    signers: Vec<&Keypair>,
) -> Result<Transaction, SbError> {
    let payer = signers[0];
    let ix = Instruction {
        program_id: SWITCHBOARD_ATTESTATION_PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: params.data(),
    };
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let blockhash = anchor_client
        .program(SWITCHBOARD_ATTESTATION_PROGRAM_ID)
        .unwrap()
        .rpc()
        .get_latest_blockhash()
        .map_err(|_| SbError::SolanaBlockhashError)?;
    tx.try_sign(&signers, blockhash)
        .map_err(|e| SbError::SolanaSignError(Arc::new(e), "Keypair likely rotated".into()))?;
    Ok(tx)
}

// pub async fn get_async_rpc(client: &Arc<RwLock<AnchorClient>>) -> Result<Arc<RpcClient>, SbError> {
    // let client = client.clone();
    // let ro_client = client.read().await;
    // let rpc = ro_client
        // .program(SWITCHBOARD_ATTESTATION_PROGRAM_ID)
        // .unwrap()
        // .async_rpc();
    // // .map_err(|e| SbError::CustomError { message: "Failed to get Anchor program".to_string(), source: Arc::new(e) })?;
    // Ok(Arc::new(rpc))
// }

pub async fn get_enclave_signer_pubkey(
    enclave_signer: &Arc<RwLock<Keypair>>,
) -> Result<Arc<Pubkey>, SbError> {
    let enclave_signer = enclave_signer.clone();
    let ro_enclave_signer = enclave_signer.read().await;
    let pubkey = Arc::new(ro_enclave_signer.pubkey());
    Ok(pubkey)
}
