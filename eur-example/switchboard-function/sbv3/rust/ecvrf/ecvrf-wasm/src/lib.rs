extern crate bincode;
extern crate rand;
extern crate rust_ecvrf;
extern crate wasm_bindgen;

#[macro_use]
mod util;

use util::hex_bytes;
use util::to_hex;

use wasm_bindgen::prelude::*;

use rust_ecvrf::{ed25519_PrivateKey, ed25519_PublicKey, ECVRF_Proof, ECVRF_prove, ECVRF_verify};

#[wasm_bindgen]
pub fn ecvrf_prove(secret_key: &str, alpha: &str) -> Result<String, JsError> {
    let mut secret = [0u8; 32];
    let args_secret =
        hex_bytes(&secret_key).or_else(|_| Err(JsError::new("Expected 64 byte hex string")))?;

    if args_secret.len() != 32 {
        let err_msg = format!(
            "Invalid secret len {} -- must be 64 bytes",
            args_secret.len()
        );
        return Err(JsError::new(err_msg.as_str()));
    }

    secret.copy_from_slice(&args_secret);
    let secret_key = ed25519_PrivateKey::from_bytes(&secret).or_else(|_| {
        Err(JsError::new(
            "Failed to convert secret key hex string to bytes",
        ))
    })?;
    let message_bytes = hex_bytes(&alpha)
        .or_else(|_| Err(JsError::new("Failed to convert alpha hex string to bytes")))?;

    let proof = ECVRF_prove(&secret_key, &message_bytes)
        .or_else(|_| Err(JsError::new("Failed to compute ECVRF proof")))?;
    let proof_str = to_hex(&proof.to_bytes().unwrap());
    Ok(proof_str)
}

#[wasm_bindgen]
pub fn ecvrf_verify(producer_pubkey: &str, proof: &str, alpha: &str) -> Result<bool, JsError> {
    let mut pubkey_bytes = [0u8; 32];
    let mut proof_bytes = [0u8; 80];

    let args_pubkey_bytes = hex_bytes(&producer_pubkey)
        .or_else(|_| Err(JsError::new("Expected 32 byte hex string")))?;
    let args_proof_bytes =
        hex_bytes(&proof).or_else(|_| Err(JsError::new("Expected 80 byte proof string")))?;

    let message_bytes = alpha.as_bytes().to_vec();

    if args_pubkey_bytes.len() != 32 {
        let err_msg = format!(
            "Invalid pubkey len {} -- must be 32 bytes",
            args_pubkey_bytes.len()
        );
        return Err(JsError::new(err_msg.as_str()));
    }

    if args_proof_bytes.len() != 80 {
        let err_msg = format!(
            "Invalid proof len {} -- must be 80 bytes",
            args_proof_bytes.len()
        );
        return Err(JsError::new(err_msg.as_str()));
    }

    pubkey_bytes.copy_from_slice(&args_pubkey_bytes);
    proof_bytes.copy_from_slice(&args_proof_bytes);

    let proof = ECVRF_Proof::from_slice(&proof_bytes)
        .or_else(|_| Err(JsError::new("Failed to convert proof bytes")))?;
    let pubkey = ed25519_PublicKey::from_bytes(&pubkey_bytes)
        .or_else(|_| Err(JsError::new("Failed to convert producer pubkey bytes")))?;
    let result = ECVRF_verify(&pubkey, &proof, &message_bytes)
        .or_else(|_| Err(JsError::new("Failed to verify proof")))?;
    Ok(result)
}
