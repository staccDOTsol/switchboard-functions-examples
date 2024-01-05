use crate::*;
use coins_bip32::derived::DerivedXPriv;
use coins_bip32::ecdsa::SigningKey;
use coins_bip32::xkeys::Parent;
use env::Env;
use ethers::signers::LocalWallet;

use hex;
use lazy_static::lazy_static;
use std::sync::Arc;
use tokio::sync::Mutex;

lazy_static! {
    static ref SIGNER_MANAGER: Arc<Mutex<SignerManager>> =
        Arc::new(Mutex::new(SignerManager::new()));
}

pub struct SignerManager {
    pub idx: usize,
    pub wallets: Vec<LocalWallet>,
}

impl SignerManager {
    pub fn new() -> Self {
        let payer = &Env::get().PAYER_SECRET;
        let _chain_id: u64 = Env::get().CHAIN_ID;
        let payer = hex::decode(payer).unwrap();
        let derived_root = DerivedXPriv::root_from_seed(&payer, None).unwrap();
        let mut wallets = vec![];
        for i in 0..10 {
            let child = derived_root.derive_child(i).unwrap();
            let child_wallet: &SigningKey = child.as_ref();
            wallets.push(LocalWallet::from(child_wallet.clone()));
        }
        Self { idx: 0, wallets }
    }

    pub async fn next() -> LocalWallet {
        let mut lock = SIGNER_MANAGER.lock().await;
        let res = lock.wallets[lock.idx].clone();
        lock.idx += 1;
        lock.idx %= lock.wallets.len();
        res
    }
}
