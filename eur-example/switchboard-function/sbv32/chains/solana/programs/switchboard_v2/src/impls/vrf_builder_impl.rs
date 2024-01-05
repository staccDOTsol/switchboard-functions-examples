use crate::curve25519_dalek_onchain::backend::serial::scalar_mul::variable_base::mul;
use crate::curve25519_dalek_onchain::constants::RISTRETTO_BASEPOINT_POINT;
use crate::curve25519_dalek_onchain::ristretto::RistrettoPoint;
use crate::ecvrf::curve25519_dalek_onchain::traits::IsIdentity;
use crate::ecvrf::ECVRF_ed25519_PublicKey_to_RistrettoPoint_1;
use crate::ecvrf::ECVRF_ed25519_PublicKey_to_RistrettoPoint_2;
use crate::ecvrf::ECVRF_ed25519_scalar_from_hash128;
use crate::ecvrf::ECVRF_hash_points_fini;
use crate::ecvrf::ECVRF_hash_points_p1;
use crate::ecvrf::ECVRF_hash_points_p2;
use crate::*;
use anchor_lang::prelude::*;
use sha2::{Digest, Sha256, Sha512};

pub struct VrfBuilderCtx {
    pub repr_proof: Vec<u8>,
    pub alpha: Vec<u8>,

    pub vrf_pubkey: Pubkey,
    pub oracle_pubkey: Pubkey,
    pub authority_pubkey: Pubkey,
}

impl VrfBuilder {
    pub fn xor_in_place(a: &mut [u8; 32], b: &[u8; 32]) {
        for (b1, b2) in a.iter_mut().zip(b.iter()) {
            *b1 ^= *b2;
        }
    }

    pub fn actuate(&mut self, ctx: &VrfBuilderCtx) -> Result<()> {
        if self.status == VrfStatus::StatusCallbackSuccess {
            return Err(error!(SwitchboardError::VrfTooManyVerifyCallsError));
        }
        let stage: u32 = self.stage;
        match stage {
            0 => self.prove(ctx),
            1 => self.actuate_1(ctx),
            2 => self.actuate_2(ctx),
            3 => self.actuate_3(ctx),
            4 => self.actuate_4(ctx),
            5 => self.actuate_5(ctx),
            6 => self.actuate_6(ctx),
            7 => self.actuate_7(ctx),
            8 => self.actuate_8(ctx),
            9 => self.actuate_9(ctx),
            10 => self.actuate_10(ctx),
            11 => self.actuate_11(ctx),
            12 => self.actuate_12(ctx),
            13 => self.actuate_13(ctx),
            14 => self.actuate_14(ctx),
            15 => self.actuate_15(ctx),
            // 16 => self.actuate_16(ctx),
            _ => Err(error!(SwitchboardError::VrfTooManyVerifyCallsError)),
        }?;

        Ok(())
    }

    pub fn prove(&mut self, ctx: &VrfBuilderCtx) -> Result<()> {
        self.repr_proof.clone_from_slice(&ctx.repr_proof);
        // msg!("Status {:?}", self.status);
        require!(
            self.status == VrfStatus::StatusRequesting,
            SwitchboardError::FuckingImpossibleError
        );
        self.status = VrfStatus::StatusVerifying;
        emit!(VrfProveEvent {
            vrf_pubkey: ctx.vrf_pubkey,
            oracle_pubkey: ctx.oracle_pubkey,
            authority_pubkey: ctx.authority_pubkey,
        });
        self.stage = 1;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        // msg!("Status {:?}", self.status);
        Ok(())
    }

    pub fn actuate_1(&mut self, ctx: &VrfBuilderCtx) -> Result<()> {
        let pubkey = ctx.authority_pubkey;
        let pk_bytes = pubkey.to_bytes();

        let mut hasher = Sha512::new();
        let mut result = [0u8; 64]; // encodes 2 field elements from the hash

        hasher.input([SUITE, 0x01]);
        hasher.input(&pk_bytes[..]);
        hasher.input(&ctx.alpha);

        let rs = &hasher.result()[..];
        result.copy_from_slice(rs);
        self.stage1_out = RistrettoPoint::from_uniform_bytes_p1(&result[..32]);
        self.stage = 2;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_2(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let proof = &self.repr_proof;
        let (m1, m2) = EcvrfProof::from_slice_1(&proof[..]).unwrap();
        self.m1 = m1.into();
        self.m2 = m2.into();
        self.stage = 3;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_3(&mut self, ctx: &VrfBuilderCtx) -> Result<()> {
        let pubkey = ctx.authority_pubkey;
        let m1 = self.m1.into();
        let m2 = self.m2.into();
        let proof = self.repr_proof;
        let proof: EcvrfProof = EcvrfProof::from_slice_2(&proof[..], m1, m2).unwrap();
        self.proof = proof.into();
        self.stage = 1;
        self.Y_point = pubkey;
        self.stage = 4;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_4(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let ei: EcvrfIntermediate = self.stage1_out;
        let (a, b, c, d, e) = (
            ei.r.into(),
            ei.N_s.into(),
            ei.D.into(),
            ei.t13.into(),
            ei.t15.into(),
        );
        let R_1 = RistrettoPoint::from_uniform_bytes_p2(a, b, c, d, e);
        self.R_1 = R_1.into();
        self.stage = 5;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_5(&mut self, ctx: &VrfBuilderCtx) -> Result<()> {
        let pk_bytes = self.Y_point.to_bytes();

        let mut hasher = Sha512::new();
        let mut result = [0u8; 64]; // encodes 2 field elements from the hash

        hasher.input([SUITE, 0x01]);
        hasher.input(&pk_bytes[..]);
        hasher.input(&ctx.alpha);

        let rs = &hasher.result()[..];
        result.copy_from_slice(rs);
        self.stage3_out = RistrettoPoint::from_uniform_bytes_p1(&result[32..]);
        self.stage = 6;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_6(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let ei: EcvrfIntermediate = self.stage3_out;
        let (a, b, c, d, e) = (
            ei.r.into(),
            ei.N_s.into(),
            ei.D.into(),
            ei.t13.into(),
            ei.t15.into(),
        );
        let R_2 = RistrettoPoint::from_uniform_bytes_p2(a, b, c, d, e);
        self.R_2 = R_2.into();
        self.stage = 7;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_7(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let R_1: RistrettoPoint = self.R_1.into();
        let R_2: RistrettoPoint = self.R_2.into();
        let H_point: RistrettoPoint = R_1 + R_2;
        self.H_point = H_point.into();
        self.stage = 8;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_8(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let b = ECVRF_ed25519_PublicKey_to_RistrettoPoint_1(&self.Y_point);
        self.Y_point_builder = [b[0].into(), b[1].into(), b[2].into()];
        self.stage = 9;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_9(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let proof: EcvrfProof = self.proof.into();
        let b = self.Y_point_builder;
        let s_reduced: Scalar = proof.s.reduce();
        let Y_ristretto_point: RistrettoPoint = ECVRF_ed25519_PublicKey_to_RistrettoPoint_2(
            &self.Y_point,
            [b[0].into(), b[1].into(), b[2].into()],
        );

        self.Y_ristretto_point = Y_ristretto_point.into();
        self.s_reduced = s_reduced;
        self.mul_round = 63;
        self.stage = 10;
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_10(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let Y_ristretto_point: RistrettoPoint = self.Y_ristretto_point.into();
        // Cover section 5.6.1 https://is.gd/uzFkux
        if Y_ristretto_point.0.mul_by_cofactor().is_identity() {
            return Err(error!(SwitchboardError::VrfInvalidPubkeyError));
        }
        self.stage = 11;
        Ok(())
    }

    pub fn actuate_11(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let s_reduced: Scalar = self.s_reduced;
        let round = self.mul_round.into();
        let tmp1 = self.mul_tmp1.into();
        let (tmp1, _tmp2, _tmp3) = mul(round, tmp1, &RISTRETTO_BASEPOINT_POINT.0, &s_reduced);
        self.mul_tmp1 = tmp1.into();
        if self.mul_round == 0 {
            self.U_point1 = tmp1.to_extended().into();
            self.mul_round = 63;
            self.mul_tmp1 = Default::default();
            self.stage = 12;
        } else {
            self.mul_round -= 1;
        }
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_12(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let proof: EcvrfProof = self.proof.into();
        let Y_ristretto_point: RistrettoPoint = self.Y_ristretto_point.into();
        let round = self.mul_round.into();
        let tmp1 = self.mul_tmp1.into();
        let (tmp1, _tmp2, _tmp3) = mul(round, tmp1, &Y_ristretto_point.0, &proof.c);

        self.mul_tmp1 = tmp1.into();
        if self.mul_round == 0 {
            self.U_point2 = tmp1.to_extended().into();
            self.mul_round = 63;
            self.mul_tmp1 = Default::default();
            self.stage = 13;
        } else {
            self.mul_round -= 1;
        }
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_13(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let H_point: RistrettoPoint = self.H_point.into();
        let s_reduced: Scalar = self.s_reduced;
        let round = self.mul_round.into();
        let tmp1 = self.mul_tmp1.into();
        let (tmp1, _tmp2, _tmp3) = mul(round, tmp1, &H_point.0, &s_reduced);
        self.mul_tmp1 = tmp1.into();
        if self.mul_round == 0 {
            self.V_point1 = tmp1.to_extended().into();
            self.mul_round = 63;
            self.mul_tmp1 = Default::default();
            self.stage = 14;
        } else {
            self.mul_round -= 1;
        }
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_14(&mut self, _ctx: &VrfBuilderCtx) -> Result<()> {
        let proof: EcvrfProof = self.proof.into();
        let round = self.mul_round.into();
        let tmp1 = self.mul_tmp1.into();
        let Gamma: RistrettoPoint = proof.Gamma;
        let (tmp1, _tmp2, _tmp3) = mul(round, tmp1, &Gamma.0, &proof.c);
        self.mul_tmp1 = tmp1.into();
        if self.mul_round == 0 {
            self.V_point2 = tmp1.to_extended().into();
            let U_point1: RistrettoPoint = self.U_point1.into();
            let U_point2: RistrettoPoint = self.U_point2.into();
            let V_point1: RistrettoPoint = self.V_point1.into();
            let V_point2: RistrettoPoint = self.V_point2.into();
            self.U_point = (U_point1 - U_point2).into();
            self.V_point = (V_point1 - V_point2).into();
            self.stage = 15;
        } else {
            self.mul_round -= 1;
        }
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_15(&mut self, ctx: &VrfBuilderCtx) -> Result<()> {
        let proof: EcvrfProof = self.proof.into();
        let H_point: RistrettoPoint = self.H_point.into();
        let U_point: RistrettoPoint = self.U_point.into();
        let V_point: RistrettoPoint = self.V_point.into();
        let u1 = self.u1.into();
        let u2 = self.u2.into();
        let invertee = self.invertee.into();
        let y = self.y.into();
        let z = self.z.into();
        let round = self.hash_points_round;
        self.hash_points_round += 1;
        if round == 0 {
            let (u1, u2, invertee, y, z) = ECVRF_hash_points_p1(&H_point);
            self.u1 = u1.into();
            self.u2 = u2.into();
            self.invertee = invertee.into();
            self.y = y.into();
            self.z = z.into();
        } else if round == 1 {
            let p1_bytes = ECVRF_hash_points_p2(&H_point, &u1, &u2, &invertee, &y, &z);
            self.p1_bytes = p1_bytes.try_into().unwrap();
        } else if round == 2 {
            let (u1, u2, invertee, y, z) = ECVRF_hash_points_p1(&proof.Gamma);
            self.u1 = u1.into();
            self.u2 = u2.into();
            self.invertee = invertee.into();
            self.y = y.into();
            self.z = z.into();
        } else if round == 3 {
            let p2_bytes = ECVRF_hash_points_p2(&proof.Gamma, &u1, &u2, &invertee, &y, &z);
            self.p2_bytes = p2_bytes.try_into().unwrap();
        } else if round == 4 {
            let (u1, u2, invertee, y, z) = ECVRF_hash_points_p1(&U_point);
            self.u1 = u1.into();
            self.u2 = u2.into();
            self.invertee = invertee.into();
            self.y = y.into();
            self.z = z.into();
        } else if round == 5 {
            let p3_bytes = ECVRF_hash_points_p2(&U_point, &u1, &u2, &invertee, &y, &z);
            self.p3_bytes = p3_bytes.try_into().unwrap();
        } else if round == 6 {
            let (u1, u2, invertee, y, z) = ECVRF_hash_points_p1(&V_point);
            self.u1 = u1.into();
            self.u2 = u2.into();
            self.invertee = invertee.into();
            self.y = y.into();
            self.z = z.into();
        } else if round == 7 {
            let p4_bytes = ECVRF_hash_points_p2(&V_point, &u1, &u2, &invertee, &y, &z);
            self.p4_bytes = p4_bytes.try_into().unwrap();
        } else if round == 8 {
            let p1_bytes = self.p1_bytes;
            let p2_bytes = self.p2_bytes;
            let p3_bytes = self.p3_bytes;
            let p4_bytes = self.p4_bytes;
            let c_prime_hashbuf =
                ECVRF_hash_points_fini(&p1_bytes, &p2_bytes, &p3_bytes, &p4_bytes);
            self.c_prime_hashbuf = c_prime_hashbuf;
        } else if round == 9 {
            let c_prime_hashbuf = self.c_prime_hashbuf;
            let c_prime = ECVRF_ed25519_scalar_from_hash128(&c_prime_hashbuf);
            // // NOTE: this leverages constant-time comparison inherited from the Scalar impl
            self.verified = c_prime == proof.c;
            if self.verified {
                let mut hasher = Sha256::new();

                hasher.input(bytemuck::bytes_of(&self.proof.Gamma));
                let out: [u8; 32] = hasher.result()[..].try_into().unwrap();
                self.result.clone_from_slice(&out);

                emit!(VrfVerifyEvent {
                    vrf_pubkey: ctx.vrf_pubkey.key(),
                    oracle_pubkey: ctx.oracle_pubkey.key(),
                    authority_pubkey: ctx.authority_pubkey.key(),
                    amount: 0,
                });

                self.stage = 16;
                self.status = VrfStatus::StatusVerified;
            } else {
                // msg!("c_prime: {:?}", c_prime);
                // msg!("proof.c: {:?}", proof.c);
                self.stage = 16;
                self.status = VrfStatus::StatusVerifyFailure;
            }
        }
        self.tx_remaining = self.tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }
}
