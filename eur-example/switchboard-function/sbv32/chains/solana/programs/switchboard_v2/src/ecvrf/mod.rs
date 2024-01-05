#![allow(non_camel_case_types)]
#![allow(unused_macros)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]
#![allow(deprecated)]
#![allow(dead_code)]
pub mod curve25519_dalek_onchain;
pub mod util;
use util::Error as ECVRF_Error;

use crate::*;
use anchor_lang::prelude::*;

// use crate::ecvrf::curve25519_dalek_onchain::constants;
use crate::ecvrf::curve25519_dalek_onchain::edwards::CompressedEdwardsY;
use crate::ecvrf::curve25519_dalek_onchain::field::FieldElement;
use crate::ecvrf::curve25519_dalek_onchain::ristretto::{CompressedRistretto, RistrettoPoint};
use crate::ecvrf::Scalar as ed25519_Scalar;
use solana_program::log::sol_log_compute_units;
use std::result::Result as BaseResult;

use std::convert::TryInto;

use sha2::Digest;
use sha2::Sha512;

impl EcvrfProof {
    pub fn from_slice_1(bytes: &[u8]) -> BaseResult<(FieldElement, FieldElement), ECVRF_Error> {
        if bytes.len() != 80 {
            // msg!("LEN {}", bytes.len());
            return Err(ECVRF_Error::InvalidDataError);
        }

        // format:
        // 0                            32         48                         80
        // |----------------------------|----------|---------------------------|
        //      Gamma point               c scalar   s scalar
        let c_ristretto = CompressedRistretto::from_slice(&bytes[0..32]);
        let (m1, m2) = c_ristretto.decompress_m1();
        Ok((m1, m2))
    }

    pub fn from_slice_2(
        bytes: &[u8],
        m1: FieldElement,
        m2: FieldElement,
    ) -> BaseResult<EcvrfProof, ECVRF_Error> {
        if bytes.len() != 80 {
            // msg!("LEN {}", bytes.len());
            return Err(ECVRF_Error::InvalidDataError);
        }

        // format:
        // 0                            32         48                         80
        // |----------------------------|----------|---------------------------|
        //      Gamma point               c scalar   s scalar
        let c_ristretto = CompressedRistretto::from_slice(&bytes[0..32]);
        let gamma_opt = c_ristretto.decompress_m2(&m1, &m2);
        // msg!("3");
        // let gamma_opt = c_ristretto.decompress_fini(&partial_gamma_opt.unwrap());

        let mut c_buf = bytes[32..48].to_vec();
        c_buf.resize(32, 0);
        let c_buf = c_buf.as_slice().try_into().unwrap();
        let s_buf = bytes[48..80].try_into().unwrap();

        let c = ed25519_Scalar::from_bits(c_buf);
        let s = ed25519_Scalar::from_bits(s_buf);

        if gamma_opt.is_none() {
            msg!("Proof is invalid");
            return Err(ECVRF_Error::InvalidDataError);
        }
        Ok(EcvrfProof {
            Gamma: gamma_opt.unwrap(),
            c,
            s,
        })
    }

    // pub fn from_bytes(bytes: &Vec<u8>) -> Result<EcvrfProof, ECVRF_Error> {
    // EcvrfProof::from_slice(&bytes[..])
    // }
}

pub fn ECVRF_ed25519_scalar_from_hash128(hash128: &[u8; 16]) -> ed25519_Scalar {
    let mut scalar_buf = [0u8; 32];
    scalar_buf[0..16].clone_from_slice(&hash128[0..16]);

    ed25519_Scalar::from_bits(scalar_buf)
}

pub fn ECVRF_hash_points_p1(
    p: &RistrettoPoint,
) -> (
    FieldElement,
    FieldElement,
    FieldElement,
    FieldElement,
    FieldElement,
) {
    ECVRF_point_to_string_p1(p)
}

pub fn ECVRF_hash_points_p2(
    p: &RistrettoPoint,
    u1: &FieldElement,
    u2: &FieldElement,
    invertee: &FieldElement,
    y: &FieldElement,
    z: &FieldElement,
) -> Vec<u8> {
    ECVRF_point_to_string_p2(p, u1, u2, invertee, y, z)
}

pub fn ECVRF_hash_points_fini(
    p1_bytes: &[u8],
    p2_bytes: &[u8],
    p3_bytes: &[u8],
    p4_bytes: &[u8],
) -> [u8; 16] {
    let mut hasher = Sha512::new();
    let mut sha512_result = [0u8; 64];
    let mut hash128 = [0u8; 16];
    hasher.input([SUITE, 0x02]);
    hasher.input(p1_bytes);
    hasher.input(p2_bytes);
    hasher.input(p3_bytes);
    hasher.input(p4_bytes);

    let rs = &hasher.result()[..];
    sha512_result.copy_from_slice(rs);

    hash128[..16].clone_from_slice(&sha512_result[..16]);
    hash128
}

//cipher suite (not standardized yet).  This would be ECVRF-ED25519-SHA512-RistrettoElligator -- i.e. using the Ristretto group on ed25519 and its elligator function
pub const SUITE: u8 = 0x05;

pub fn ECVRF_point_to_string_p1(
    p: &RistrettoPoint,
) -> (
    FieldElement,
    FieldElement,
    FieldElement,
    FieldElement,
    FieldElement,
) {
    p.compress_p1()
}

pub fn ECVRF_point_to_string_p2(
    p: &RistrettoPoint,
    u1: &FieldElement,
    u2: &FieldElement,
    invertee: &FieldElement,
    y: &FieldElement,
    z: &FieldElement,
) -> Vec<u8> {
    p.compress_p2(u1, u2, invertee, y, z).as_bytes().to_vec()
}

pub fn ECVRF_ed25519_PublicKey_to_RistrettoPoint_1(public_key: &Pubkey) -> [FieldElement; 3] {
    // for reasons above my pay grade, curve25519_dalek does not expose a RistrettoPoint's internal
    // EdwardsPoint (even though it is, structurally, the same thing).

    let public_key_edy = CompressedEdwardsY::from_slice(&public_key.to_bytes());
    sol_log_compute_units();
    let (x, y, z) = public_key_edy.decompress_init();
    [x, y, z]
}

pub fn ECVRF_ed25519_PublicKey_to_RistrettoPoint_2(
    public_key: &Pubkey,
    beta: [FieldElement; 3],
) -> RistrettoPoint {
    let public_key_edy = CompressedEdwardsY::from_slice(&public_key.to_bytes());
    let public_key_ed = public_key_edy
        .decompress_fini(beta[0], beta[1], beta[2])
        .unwrap();
    use std::mem::transmute;

    unsafe { transmute::<EdwardsPoint, RistrettoPoint>(public_key_ed) }
}

// fn ECVRF_ed25519_PublicKey_to_RistrettoPoint_2(public_key: &Pubkey) -> RistrettoPoint {
// // for reasons above my pay grade, curve25519_dalek does not expose a RistrettoPoint's internal
// // EdwardsPoint (even though it is, structurally, the same thing).
//
// let public_key_edy = CompressedEdwardsY::from_slice(&public_key.to_bytes());
// sol_log_compute_units();
// let public_key_ed = public_key_edy.decompress_fini().unwrap();
// sol_log_compute_units();
//
// use std::mem::transmute;
// let rp = unsafe { transmute::<EdwardsPoint, RistrettoPoint>(public_key_ed) };
// return rp;
// }
//
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Callback {
    pub program_id: Pubkey,
    pub accounts: Vec<AccountMetaBorsh>,
    pub ix_data: Vec<u8>,
}
impl Into<CallbackZC> for Callback {
    fn into(self) -> CallbackZC {
        let mut cb: CallbackZC = Default::default();
        cb.program_id = self.program_id;
        cb.ix_data_len = self.ix_data.len().try_into().unwrap();
        cb.ix_data[..self.ix_data.len()].clone_from_slice(self.ix_data.as_slice());
        cb.accounts_len = self.accounts.len().try_into().unwrap();
        for i in 0..self.accounts.len() {
            cb.accounts[i] = AccountMetaZC {
                pubkey: self.accounts[i].pubkey,
                is_signer: self.accounts[i].is_signer,
                is_writable: self.accounts[i].is_writable,
            };
        }
        cb
    }
}
/// A `ProjectivePoint` is a point \\((X:Y:Z)\\) on the \\(\mathbb
/// P\^2\\) model of the curve.
/// A point \\((x,y)\\) in the affine model corresponds to
/// \\((x:y:1)\\).
///
/// More details on the relationships between the different curve models
/// can be found in the module-level documentation.
#[derive(Copy, Clone, Default)]
#[repr(C)]
pub struct ProjectivePoint {
    pub X: FieldElement51,
    pub Y: FieldElement51,
    pub Z: FieldElement51,
}
unsafe impl Pod for ProjectivePoint {}
unsafe impl Zeroable for ProjectivePoint {}
impl Default for ProjectivePointZC {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
impl From<ProjectivePoint> for ProjectivePointZC {
    fn from(val: ProjectivePoint) -> Self {
        ProjectivePointZC {
            X: val.X.into(),
            Y: val.Y.into(),
            Z: val.Z.into(),
        }
    }
}
impl From<ProjectivePointZC> for ProjectivePoint {
    fn from(val: ProjectivePointZC) -> Self {
        ProjectivePoint {
            X: val.X.into(),
            Y: val.Y.into(),
            Z: val.Z.into(),
        }
    }
}
/// An `EdwardsPoint` represents a point on the Edwards form of Curve25519.
#[derive(Copy, Clone)]
#[repr(C)]
pub struct EdwardsPoint {
    pub(crate) X: FieldElement51,
    pub(crate) Y: FieldElement51,
    pub(crate) Z: FieldElement51,
    pub(crate) T: FieldElement51,
}
impl Default for EdwardsPointZC {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
unsafe impl Pod for EdwardsPointZC {}
unsafe impl Zeroable for EdwardsPointZC {}
impl From<EdwardsPoint> for EdwardsPointZC {
    fn from(val: EdwardsPoint) -> Self {
        EdwardsPointZC {
            X: val.X.into(),
            Y: val.Y.into(),
            Z: val.Z.into(),
            T: val.T.into(),
        }
    }
}
impl From<EdwardsPointZC> for EdwardsPoint {
    fn from(val: EdwardsPointZC) -> Self {
        EdwardsPoint {
            X: val.X.into(),
            Y: val.Y.into(),
            Z: val.Z.into(),
            T: val.T.into(),
        }
    }
}
impl From<RistrettoPoint> for EdwardsPointZC {
    fn from(val: RistrettoPoint) -> Self {
        EdwardsPointZC {
            X: val.0.X.into(),
            Y: val.0.Y.into(),
            Z: val.0.Z.into(),
            T: val.0.T.into(),
        }
    }
}
impl From<EdwardsPointZC> for RistrettoPoint {
    fn from(val: EdwardsPointZC) -> Self {
        RistrettoPoint(EdwardsPoint {
            X: val.X.into(),
            Y: val.Y.into(),
            Z: val.Z.into(),
            T: val.T.into(),
        })
    }
}

/// A `CompletedPoint` is a point \\(((X:Z), (Y:T))\\) on the \\(\mathbb
/// P\^1 \times \mathbb P\^1 \\) model of the curve.
/// A point (x,y) in the affine model corresponds to \\( ((x:1),(y:1))
/// \\).
///
/// More details on the relationships between the different curve models
/// can be found in the module-level documentation.
#[allow(missing_docs)]
#[derive(Copy, Clone)]
#[repr(C)]
pub struct CompletedPoint {
    pub X: FieldElement51,
    pub Y: FieldElement51,
    pub Z: FieldElement51,
    pub T: FieldElement51,
}
impl Default for CompletedPointZC {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
unsafe impl Pod for CompletedPoint {}
unsafe impl Zeroable for CompletedPoint {}
impl From<CompletedPoint> for CompletedPointZC {
    fn from(val: CompletedPoint) -> Self {
        CompletedPointZC {
            X: val.X.into(),
            Y: val.Y.into(),
            Z: val.Z.into(),
            T: val.T.into(),
        }
    }
}
impl From<CompletedPointZC> for CompletedPoint {
    fn from(val: CompletedPointZC) -> Self {
        CompletedPoint {
            X: val.X.into(),
            Y: val.Y.into(),
            Z: val.Z.into(),
            T: val.T.into(),
        }
    }
}
/// A `FieldElement51` represents an element of the field
/// \\( \mathbb Z / (2\^{255} - 19)\\).
///
/// In the 64-bit implementation, a `FieldElement` is represented in
/// radix \\(2\^{51}\\) as five `u64`s; the coefficients are allowed to
/// grow up to \\(2\^{54}\\) between reductions modulo \\(p\\).
///
/// # Note
///
/// The `curve25519_dalek::field` module provides a type alias
/// `curve25519_dalek::field::FieldElement` to either `FieldElement51`
/// or `FieldElement2625`.
///
/// The backend-specific type `FieldElement51` should not be used
/// outside of the `curve25519_dalek::field` module.
#[derive(Copy, Clone, Default)]
#[repr(C)]
pub struct FieldElement51(pub(crate) [u64; 5]);
unsafe impl Pod for FieldElement51 {}
unsafe impl Zeroable for FieldElement51 {}
impl Default for FieldElementZC {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
unsafe impl Pod for FieldElementZC {}
unsafe impl Zeroable for FieldElementZC {}
impl From<FieldElement51> for FieldElementZC {
    fn from(val: FieldElement51) -> Self {
        FieldElementZC { bytes: val.0 }
    }
}
impl From<FieldElementZC> for FieldElement51 {
    fn from(val: FieldElementZC) -> Self {
        FieldElement51(val.bytes)
    }
}

#[repr(C)]
#[derive(Copy, Clone)]
pub struct EcvrfProof {
    pub Gamma: RistrettoPoint, //Ristretto
    pub c: Scalar,
    pub s: Scalar,
}
unsafe impl Pod for EcvrfProof {}
unsafe impl Zeroable for EcvrfProof {}
impl Default for EcvrfProofZC {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
unsafe impl Pod for EcvrfProofZC {}
unsafe impl Zeroable for EcvrfProofZC {}
impl From<EcvrfProof> for EcvrfProofZC {
    fn from(val: EcvrfProof) -> Self {
        EcvrfProofZC {
            Gamma: val.Gamma.into(),
            c: val.c,
            s: val.s,
        }
    }
}
impl From<EcvrfProofZC> for EcvrfProof {
    fn from(val: EcvrfProofZC) -> Self {
        EcvrfProof {
            Gamma: val.Gamma.into(),
            c: val.c,
            s: val.s,
        }
    }
}

#[zero_copy(unsafe)]
#[repr(packed)]
pub struct EcvrfProofZC {
    pub Gamma: EdwardsPointZC, // RistrettoPoint
    pub c: Scalar,
    pub s: Scalar,
}

/// The `Scalar` struct holds an integer \\(s < 2\^{255} \\) which
/// represents an element of \\(\mathbb Z / \ell\\).
#[zero_copy(unsafe)]
#[repr(packed)]
pub struct Scalar {
    /// `bytes` is a little-endian byte encoding of an integer representing a scalar modulo the
    /// group order.
    ///
    /// # Invariant
    ///
    /// The integer representing this scalar must be bounded above by \\(2\^{255}\\), or
    /// equivalently the high bit of `bytes[31]` must be zero.
    ///
    /// This ensures that there is room for a carry bit when computing a NAF representation.
    //
    // XXX This is pub(crate) so we can write literal constants.  If const fns were stable, we could
    //     make the Scalar constructors const fns and use those instead.
    pub(crate) bytes: [u8; 32],
}
unsafe impl Pod for Scalar {}
unsafe impl Zeroable for Scalar {}

#[zero_copy(unsafe)]
#[repr(packed)]
pub struct FieldElementZC {
    pub(crate) bytes: [u64; 5],
}
#[zero_copy(unsafe)]
#[repr(packed)]
pub struct CompletedPointZC {
    pub X: FieldElementZC,
    pub Y: FieldElementZC,
    pub Z: FieldElementZC,
    pub T: FieldElementZC,
}

#[zero_copy(unsafe)]
#[repr(packed)]
pub struct EdwardsPointZC {
    pub(crate) X: FieldElementZC,
    pub(crate) Y: FieldElementZC,
    pub(crate) Z: FieldElementZC,
    pub(crate) T: FieldElementZC,
}

#[zero_copy(unsafe)]
#[repr(packed)]
pub struct ProjectivePointZC {
    pub(crate) X: FieldElementZC,
    pub(crate) Y: FieldElementZC,
    pub(crate) Z: FieldElementZC,
}

#[zero_copy(unsafe)]
#[repr(packed)]
pub struct EcvrfIntermediate {
    pub r: FieldElementZC,
    pub N_s: FieldElementZC,
    pub D: FieldElementZC,
    pub t13: FieldElementZC,
    pub t15: FieldElementZC,
}
unsafe impl Pod for EcvrfIntermediate {}
unsafe impl Zeroable for EcvrfIntermediate {}
impl Default for CallbackZC {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
impl From<AccountMetaZC> for AccountMeta {
    fn from(val: AccountMetaZC) -> Self {
        AccountMeta {
            pubkey: val.pubkey,
            is_signer: val.is_signer,
            is_writable: val.is_writable,
        }
    }
}
