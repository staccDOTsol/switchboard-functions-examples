#![allow(non_snake_case)]
extern crate bincode;
extern crate curve25519_dalek;
extern crate ed25519_dalek;
extern crate rand;
extern crate serde;
extern crate serde_derive;
extern crate sha2;

#[macro_use]
mod util;

use util::Error as ECVRF_Error;

pub use ed25519_dalek::PublicKey as ed25519_PublicKey;
pub use ed25519_dalek::SecretKey as ed25519_PrivateKey;

use curve25519_dalek::constants::RISTRETTO_BASEPOINT_POINT;
use curve25519_dalek::edwards::{CompressedEdwardsY, EdwardsPoint};
use curve25519_dalek::ristretto::{CompressedRistretto, RistrettoPoint};
use curve25519_dalek::scalar::Scalar as ed25519_Scalar;

use sha2::Digest;
use sha2::Sha512;

pub const SUITE: u8 = 0x05; /* cipher suite (not standardized yet).  This would be ECVRF-ED25519-SHA512-RistrettoElligator -- i.e. using the Ristretto group on ed25519 and its elligator function */

#[allow(non_camel_case_types)]
pub struct ECVRF_Proof {
    pub Gamma: RistrettoPoint,
    pub c: ed25519_Scalar,
    pub s: ed25519_Scalar,
}

impl ECVRF_Proof {
    pub fn from_slice(bytes: &[u8]) -> Result<ECVRF_Proof, ECVRF_Error> {
        match bytes.len() {
            80 => {
                // format:
                // 0                            32         48                         80
                // |----------------------------|----------|---------------------------|
                //      Gamma point               c scalar   s scalar
                let gamma_opt = CompressedRistretto::from_slice(&bytes[0..32]).decompress();
                if gamma_opt.is_none() {
                    return Err(ECVRF_Error::InvalidDataError);
                }

                let mut c_buf = [0u8; 32];
                let mut s_buf = [0u8; 32];

                for i in 0..16 {
                    c_buf[i] = bytes[32 + i];
                }
                for i in 0..32 {
                    s_buf[i] = bytes[48 + i];
                }

                let c = ed25519_Scalar::from_bits(c_buf);
                let s = ed25519_Scalar::from_bits(s_buf);

                Ok(ECVRF_Proof {
                    Gamma: gamma_opt.unwrap(),
                    c: c,
                    s: s,
                })
            }
            _ => Err(ECVRF_Error::InvalidDataError),
        }
    }

    pub fn from_bytes(bytes: &Vec<u8>) -> Result<ECVRF_Proof, ECVRF_Error> {
        ECVRF_Proof::from_slice(&bytes[..])
    }

    pub fn to_bytes(&self) -> Result<[u8; 80], ECVRF_Error> {
        let mut c_bytes_16 = [0u8; 16];
        let c_bytes = self.c.reduce().to_bytes();

        // upper 16 bytes of c must be 0's
        for i in 16..32 {
            if c_bytes[i] != 0 {
                return Err(ECVRF_Error::InvalidDataError);
            }

            c_bytes_16[i - 16] = c_bytes[i - 16];
        }

        let gamma_bytes = self.Gamma.compress().to_bytes();
        let s_bytes = self.s.to_bytes();

        let mut ret: Vec<u8> = Vec::with_capacity(80);
        ret.extend_from_slice(&gamma_bytes);
        ret.extend_from_slice(&c_bytes_16);
        ret.extend_from_slice(&s_bytes);

        let mut proof_bytes = [0u8; 80];
        proof_bytes.copy_from_slice(&ret[..]);
        Ok(proof_bytes)
    }
}

pub fn ECVRF_point_to_string(p: &RistrettoPoint) -> Vec<u8> {
    p.compress().as_bytes().to_vec()
}

pub fn ECVRF_hash_to_curve(
    y: &ed25519_PublicKey,
    alpha: &Vec<u8>,
) -> Result<RistrettoPoint, ECVRF_Error> {
    let pk_bytes = y.to_bytes();

    let mut hasher = Sha512::new();
    let mut result = [0u8; 64]; // encodes 2 field elements from the hash

    hasher.input(&[SUITE, 0x01]);
    hasher.input(&pk_bytes[..]);
    hasher.input(&alpha[..]);

    let rs = &hasher.result()[..];
    result.copy_from_slice(&rs);

    Ok(RistrettoPoint::from_uniform_bytes(&result))
}

pub fn ECVRF_hash_points(
    p1: &RistrettoPoint,
    p2: &RistrettoPoint,
    p3: &RistrettoPoint,
    p4: &RistrettoPoint,
) -> [u8; 16] {
    let mut hasher = Sha512::new();
    let mut sha512_result = [0u8; 64];
    let mut hash128 = [0u8; 16];

    let p1_bytes = ECVRF_point_to_string(p1);
    let p2_bytes = ECVRF_point_to_string(p2);
    let p3_bytes = ECVRF_point_to_string(p3);
    let p4_bytes = ECVRF_point_to_string(p4);

    hasher.input(&[SUITE, 0x02]);
    hasher.input(&p1_bytes[..]);
    hasher.input(&p2_bytes[..]);
    hasher.input(&p3_bytes[..]);
    hasher.input(&p4_bytes[..]);

    let rs = &hasher.result()[..];
    sha512_result.copy_from_slice(&rs);

    for i in 0..16 {
        hash128[i] = sha512_result[i];
    }

    hash128
}

pub fn ECVRF_expand_privkey(
    secret: &ed25519_PrivateKey,
) -> Result<(ed25519_PublicKey, ed25519_Scalar, [u8; 32]), ECVRF_Error> {
    let mut hasher = Sha512::new();
    let mut h = [0u8; 64];
    let mut trunc_hash = [0u8; 32];
    let pubkey = ed25519_PublicKey::from(secret);
    let privkey_buf = secret.to_bytes();

    // hash secret key to produce nonce and intermediate private key
    hasher.input(&privkey_buf[0..32]);
    h.copy_from_slice(&hasher.result()[..]);

    // h will encode a new private key, so we need to twiddle a few bits to make sure it falls in the
    // right range (i.e. the curve order).
    h[0] &= 248;
    h[31] &= 127;
    h[31] |= 64;

    let mut h_32 = [0u8; 32];
    h_32.copy_from_slice(&h[0..32]);

    let x_scalar = ed25519_Scalar::from_bits(h_32);
    trunc_hash.copy_from_slice(&h[32..64]);

    Ok((pubkey, x_scalar, trunc_hash))
}

pub fn ECVRF_nonce_generation(trunc_hash: &[u8; 32], H_point: &RistrettoPoint) -> ed25519_Scalar {
    let mut hasher = Sha512::new();
    let mut k_string = [0u8; 64];
    let h_string = H_point.compress().to_bytes();

    hasher.input(trunc_hash);
    hasher.input(&h_string);
    let rs = &hasher.result()[..];
    k_string.copy_from_slice(rs);

    let mut k_32 = [0u8; 32];
    k_32.copy_from_slice(&k_string[0..32]);

    let k = ed25519_Scalar::from_bits(k_32);
    k.reduce()
}

pub fn ECVRF_ed25519_scalar_from_hash128(hash128: &[u8; 16]) -> ed25519_Scalar {
    let mut scalar_buf = [0u8; 32];
    for i in 0..16 {
        scalar_buf[i] = hash128[i];
    }

    ed25519_Scalar::from_bits(scalar_buf)
}

pub fn ECVRF_prove(
    secret: &ed25519_PrivateKey,
    alpha: &Vec<u8>,
) -> Result<ECVRF_Proof, ECVRF_Error> {
    let (Y_point, x_scalar, trunc_hash) = ECVRF_expand_privkey(secret)?;
    let H_point = ECVRF_hash_to_curve(&Y_point, alpha)?;

    let Gamma_point = &x_scalar * &H_point;
    let k_scalar = ECVRF_nonce_generation(&trunc_hash, &H_point);

    let kB_point = &k_scalar * &RISTRETTO_BASEPOINT_POINT;
    let kH_point = &k_scalar * &H_point;

    let c_hashbuf = ECVRF_hash_points(&H_point, &Gamma_point, &kB_point, &kH_point);
    let c_scalar = ECVRF_ed25519_scalar_from_hash128(&c_hashbuf);

    let s_full_scalar = &c_scalar * &x_scalar + &k_scalar;
    let s_scalar = s_full_scalar.reduce();

    Ok(ECVRF_Proof {
        Gamma: Gamma_point,
        c: c_scalar,
        s: s_scalar,
    })
}

pub fn ECVRF_ed25519_PublicKey_to_RistrettoPoint(public_key: &ed25519_PublicKey) -> RistrettoPoint {
    // for reasons above my pay grade, curve25519_dalek does not expose a RistrettoPoint's internal
    // EdwardsPoint (even though it is, structurally, the same thing).

    let public_key_edy = CompressedEdwardsY::from_slice(public_key.as_bytes());
    let public_key_ed = public_key_edy.decompress().unwrap();

    use std::mem::transmute;
    let rp = unsafe { transmute::<EdwardsPoint, RistrettoPoint>(public_key_ed) };
    return rp;
}

pub fn ECVRF_verify(
    Y_point: &ed25519_PublicKey,
    proof: &ECVRF_Proof,
    alpha: &Vec<u8>,
) -> Result<bool, ECVRF_Error> {
    let H_point = ECVRF_hash_to_curve(Y_point, alpha)?;
    let s_reduced = proof.s.reduce();
    let Y_ristretto_point = ECVRF_ed25519_PublicKey_to_RistrettoPoint(Y_point);

    let U_point = &s_reduced * &RISTRETTO_BASEPOINT_POINT - &proof.c * Y_ristretto_point;
    let V_point = &s_reduced * &H_point - &proof.c * &proof.Gamma;

    let c_prime_hashbuf = ECVRF_hash_points(&H_point, &proof.Gamma, &U_point, &V_point);
    let c_prime = ECVRF_ed25519_scalar_from_hash128(&c_prime_hashbuf);

    // NOTE: this leverages constant-time comparison inherited from the Scalar impl
    Ok(c_prime == proof.c)
}
