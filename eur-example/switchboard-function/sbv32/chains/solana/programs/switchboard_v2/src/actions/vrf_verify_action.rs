use crate::*;
use anchor_lang::prelude::*;

use crate::curve25519_dalek_onchain::ristretto::RistrettoPoint;
use crate::curve25519_dalek_onchain::backend::serial::scalar_mul::variable_base::mul;
use crate::curve25519_dalek_onchain::constants::RISTRETTO_BASEPOINT_POINT;
use crate::ecvrf::curve25519_dalek_onchain::traits::IsIdentity;
use crate::ecvrf::ECVRF_ed25519_PublicKey_to_RistrettoPoint_1;
use crate::ecvrf::ECVRF_ed25519_PublicKey_to_RistrettoPoint_2;
use crate::ecvrf::ECVRF_ed25519_scalar_from_hash128;
use crate::ecvrf::ECVRF_hash_points_fini;
use crate::ecvrf::ECVRF_hash_points_p1;
use crate::ecvrf::ECVRF_hash_points_p2;
use solana_program::instruction::Instruction;
use solana_program::native_token::LAMPORTS_PER_SOL;
use solana_program::program::invoke;
use solana_program::sysvar::instructions::load_current_index_checked;
use anchor_spl::token::Token;

use sha2::{Digest, Sha256, Sha512};

#[derive(Accounts)]
#[instruction(params: VrfVerifyParams)] // rpc parameters hint
pub struct VrfVerify<'info> {
    #[account(mut, has_one = escrow)]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    /// CHECK: todo
    pub callback_pid: AccountInfo<'info>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(mut, constraint =
        escrow.mint == oracle_wallet.mint && escrow.owner == program_state.key())]
    pub escrow: Account<'info, TokenAccount>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(has_one = oracle_authority)]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    /// CHECK: todo
    pub oracle_authority: AccountInfo<'info>,
    #[account(mut, constraint = oracle.load()?.token_account == oracle_wallet.key())]
    pub oracle_wallet: Account<'info, TokenAccount>,
    /// CHECK: todo
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfVerifyParams {
    pub nonce: Option<u32>,
    pub state_bump: u8,
    pub idx: u32,
}
impl<'info> VrfVerify<'info> {
    pub fn xor_in_place(a: &mut [u8; 32], b: &[u8; 32]) {
        for (b1, b2) in a.iter_mut().zip(b.iter()) {
            *b1 ^= *b2;
        }
    }

    pub fn validate(
        &self,
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let vrf = ctx.accounts.vrf.load()?;
        let ins_idx = load_current_index_checked(&ctx.accounts.instructions_sysvar)?;
        if vrf.status == VrfStatus::StatusCallbackSuccess {
            if ins_idx == 0 {
                return Err(error!(SwitchboardError::VrfTooManyVerifyCallsError));
            }
            return Ok(());
        }

        if params.idx > 8 || params.idx >= vrf.batch_size {
            return Err(error!(SwitchboardError::IndexOutOfBoundsError));
        }
        if vrf.status != VrfStatus::StatusVerifying && vrf.status != VrfStatus::StatusVerified {
            msg!("1");
            return Err(error!(SwitchboardError::VrfVerifyError));
        }
        // LAST one would be VERIFIED status
        if vrf.builders[idx].status != VrfStatus::StatusVerifying
            && vrf.builders[idx].status != VrfStatus::StatusVerified
        {
            msg!("2");
            return Err(error!(SwitchboardError::VrfVerifyError));
        }
        if ctx.remaining_accounts.len() != vrf.callback.accounts_len as usize {
            msg!("incorrect number of callback accounts");
            return Err(error!(SwitchboardError::VrfCallbackParamsError));
        }
        if ctx.accounts.callback_pid.key() != vrf.callback.program_id {
            msg!("incorrect callback pid");
            return Err(error!(SwitchboardError::VrfCallbackParamsError));
        }
        if vrf.builders[idx].producer != ctx.accounts.oracle.key() {
            msg!("validate");
            return Err(error!(SwitchboardError::VrfVerifyError));
        }
        for idx in 0..ctx.remaining_accounts.len() {
            if ctx.remaining_accounts[idx].key() != vrf.callback.accounts[idx].pubkey {
                msg!("incorrect callback account");
                return Err(error!(SwitchboardError::VrfCallbackParamsError));
            }
            if ctx.remaining_accounts[idx].key() == ctx.accounts.oracle_authority.key() {
                return Err(error!(SwitchboardError::VrfCallbackParamsError));
            }
        }

        Ok(())
    }

    pub fn actuate(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let vrf = ctx.accounts.vrf.load()?;
        let stage: u32 = vrf.builders[idx].stage;
        if vrf.status == VrfStatus::StatusCallbackSuccess {
            return Ok(());
        }
        drop(vrf);
        match stage {
            0 | 1 => Self::actuate_1(ctx, params),
            2 => Self::actuate_2(ctx, params),
            3 => Self::actuate_3(ctx, params),
            4 => Self::actuate_4(ctx, params),
            5 => Self::actuate_5(ctx, params),
            6 => Self::actuate_6(ctx, params),
            7 => Self::actuate_7(ctx, params),
            8 => Self::actuate_8(ctx, params),
            9 => Self::actuate_9(ctx, params),
            10 => Self::actuate_10(ctx, params),
            11 => Self::actuate_11(ctx, params),
            12 => Self::actuate_12(ctx, params),
            13 => Self::actuate_13(ctx, params),
            14 => Self::actuate_14(ctx, params),
            15 => Self::actuate_15(ctx, params),
            16 => Self::actuate_16(ctx, params),
            _ => Err(error!(SwitchboardError::VrfTooManyVerifyCallsError)),
        }?;
        let amount: u64 = (LAMPORTS_PER_SOL / 500) / 278;
        transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.oracle_wallet,
            &ctx.accounts.program_state.to_account_info(),
            &[&[STATE_SEED, &[params.state_bump]]],
            amount,
        )
    }

    pub fn actuate_1(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let alpha = &vrf.current_round.alpha[..vrf.current_round.alpha_len as usize];
        let pubkey = ctx.accounts.oracle_authority.key();
        let pk_bytes = pubkey.to_bytes();

        let mut hasher = Sha512::new();
        let mut result = [0u8; 64]; // encodes 2 field elements from the hash

        hasher.input(&[SUITE, 0x01]);
        hasher.input(&pk_bytes[..]);
        hasher.input(&alpha);

        let rs = &hasher.result()[..];
        result.copy_from_slice(&rs);
        vrf.builders[idx].stage1_out = RistrettoPoint::from_uniform_bytes_p1(&result[..32]);
        vrf.builders[idx].stage = 2;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_2(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let proof = &vrf.builders[idx].repr_proof;
        let (m1, m2) = EcvrfProof::from_slice_1(&proof[..]).unwrap();
        vrf.builders[idx].m1 = m1.into();
        vrf.builders[idx].m2 = m2.into();
        vrf.builders[idx].stage = 3;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_3(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let pubkey = ctx.accounts.oracle_authority.key();
        let m1 = vrf.builders[idx].m1.into();
        let m2 = vrf.builders[idx].m2.into();
        let proof = vrf.builders[idx].repr_proof;
        let proof: EcvrfProof = EcvrfProof::from_slice_2(&proof[..], m1, m2).unwrap();
        vrf.builders[idx].proof = proof.into();
        vrf.builders[idx].stage = 1;
        vrf.builders[idx].Y_point = pubkey;
        vrf.builders[idx].stage = 4;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_4(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let ei: EcvrfIntermediate = vrf.builders[idx].stage1_out;
        let (a, b, c, d, e) = (
            ei.r.into(),
            ei.N_s.into(),
            ei.D.into(),
            ei.t13.into(),
            ei.t15.into(),
        );
        let R_1 = RistrettoPoint::from_uniform_bytes_p2(a, b, c, d, e);
        vrf.builders[idx].R_1 = R_1.into();
        vrf.builders[idx].stage = 5;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_5(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let pk_bytes = vrf.builders[idx].Y_point.to_bytes();
        let alpha = &vrf.current_round.alpha[..vrf.current_round.alpha_len as usize];

        let mut hasher = Sha512::new();
        let mut result = [0u8; 64]; // encodes 2 field elements from the hash

        hasher.input(&[SUITE, 0x01]);
        hasher.input(&pk_bytes[..]);
        hasher.input(&alpha);

        let rs = &hasher.result()[..];
        result.copy_from_slice(&rs);
        vrf.builders[idx].stage3_out = RistrettoPoint::from_uniform_bytes_p1(&result[32..]);
        vrf.builders[idx].stage = 6;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_6(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let ei: EcvrfIntermediate = vrf.builders[idx].stage3_out;
        let (a, b, c, d, e) = (
            ei.r.into(),
            ei.N_s.into(),
            ei.D.into(),
            ei.t13.into(),
            ei.t15.into(),
        );
        let R_2 = RistrettoPoint::from_uniform_bytes_p2(a, b, c, d, e);
        vrf.builders[idx].R_2 = R_2.into();
        vrf.builders[idx].stage = 7;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_7(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let R_1: RistrettoPoint = vrf.builders[idx].R_1.into();
        let R_2: RistrettoPoint = vrf.builders[idx].R_2.into();
        let H_point: RistrettoPoint = R_1 + R_2;
        vrf.builders[idx].H_point = H_point.into();
        vrf.builders[idx].stage = 8;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_8(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let b = ECVRF_ed25519_PublicKey_to_RistrettoPoint_1(&vrf.builders[idx].Y_point);
        vrf.builders[idx].Y_point_builder = [b[0].into(), b[1].into(), b[2].into()];
        vrf.builders[idx].stage = 9;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_9(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let proof: EcvrfProof = vrf.builders[idx].proof.into();
        let b = vrf.builders[idx].Y_point_builder;
        let s_reduced: Scalar = proof.s.reduce();
        let Y_ristretto_point: RistrettoPoint = ECVRF_ed25519_PublicKey_to_RistrettoPoint_2(
            &vrf.builders[idx].Y_point,
            [b[0].into(), b[1].into(), b[2].into()],
        );

        vrf.builders[idx].Y_ristretto_point = Y_ristretto_point.into();
        vrf.builders[idx].s_reduced = s_reduced;
        vrf.builders[idx].mul_round = 63;
        vrf.builders[idx].stage = 10;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_10(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let Y_ristretto_point: RistrettoPoint = vrf.builders[idx].Y_ristretto_point.into();
        // Cover section 5.6.1 https://is.gd/uzFkux
        if Y_ristretto_point.0.mul_by_cofactor().is_identity() {
            return Err(error!(SwitchboardError::VrfInvalidPubkeyError));
        }
        vrf.builders[idx].stage = 11;
        Ok(())
    }
    pub fn actuate_11(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let s_reduced: Scalar = vrf.builders[idx].s_reduced;
        let round = vrf.builders[idx].mul_round.into();
        let tmp1 = vrf.builders[idx].mul_tmp1.into();
        let (tmp1, _tmp2, _tmp3) = mul(round, tmp1, &RISTRETTO_BASEPOINT_POINT.0, &s_reduced);
        vrf.builders[idx].mul_tmp1 = tmp1.into();
        if vrf.builders[idx].mul_round == 0 {
            vrf.builders[idx].U_point1 = tmp1.to_extended().into();
            vrf.builders[idx].mul_round = 63;
            vrf.builders[idx].mul_tmp1 = Default::default();
            vrf.builders[idx].stage = 12;
        } else {
            vrf.builders[idx].mul_round -= 1;
        }
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_12(ctx: &Context<VrfVerify>, params: &VrfVerifyParams) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let proof: EcvrfProof = vrf.builders[idx].proof.into();
        let Y_ristretto_point: RistrettoPoint = vrf.builders[idx].Y_ristretto_point.into();
        let round = vrf.builders[idx].mul_round.into();
        let tmp1 = vrf.builders[idx].mul_tmp1.into();
        let (tmp1, _tmp2, _tmp3) = mul(round, tmp1, &Y_ristretto_point.0, &proof.c);

        vrf.builders[idx].mul_tmp1 = tmp1.into();
        if vrf.builders[idx].mul_round == 0 {
            vrf.builders[idx].U_point2 = tmp1.to_extended().into();
            vrf.builders[idx].mul_round = 63;
            vrf.builders[idx].mul_tmp1 = Default::default();
            vrf.builders[idx].stage = 13;
        } else {
            vrf.builders[idx].mul_round -= 1;
        }
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_13(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let H_point: RistrettoPoint = vrf.builders[idx].H_point.into();
        let s_reduced: Scalar = vrf.builders[idx].s_reduced;
        let round = vrf.builders[idx].mul_round.into();
        let tmp1 = vrf.builders[idx].mul_tmp1.into();
        let (tmp1, _tmp2, _tmp3) = mul(round, tmp1, &H_point.0, &s_reduced);
        vrf.builders[idx].mul_tmp1 = tmp1.into();
        if vrf.builders[idx].mul_round == 0 {
            vrf.builders[idx].V_point1 = tmp1.to_extended().into();
            vrf.builders[idx].mul_round = 63;
            vrf.builders[idx].mul_tmp1 = Default::default();
            vrf.builders[idx].stage = 14;
        } else {
            vrf.builders[idx].mul_round -= 1;
        }
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_14(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let proof: EcvrfProof = vrf.builders[idx].proof.into();
        let round = vrf.builders[idx].mul_round.into();
        let tmp1 = vrf.builders[idx].mul_tmp1.into();
        let Gamma: RistrettoPoint = proof.Gamma.into();
        let (tmp1, _tmp2, _tmp3) = mul(round, tmp1, &Gamma.0, &proof.c);
        vrf.builders[idx].mul_tmp1 = tmp1.into();
        if vrf.builders[idx].mul_round == 0 {
            vrf.builders[idx].V_point2 = tmp1.to_extended().into();
            let U_point1: RistrettoPoint = vrf.builders[idx].U_point1.into();
            let U_point2: RistrettoPoint = vrf.builders[idx].U_point2.into();
            let V_point1: RistrettoPoint = vrf.builders[idx].V_point1.into();
            let V_point2: RistrettoPoint = vrf.builders[idx].V_point2.into();
            vrf.builders[idx].U_point = (U_point1 - U_point2).into();
            vrf.builders[idx].V_point = (V_point1 - V_point2).into();
            vrf.builders[idx].stage = 15;
        } else {
            vrf.builders[idx].mul_round -= 1;
        }
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_15(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let proof: EcvrfProof = vrf.builders[idx].proof.into();
        let H_point: RistrettoPoint = vrf.builders[idx].H_point.into();
        let U_point: RistrettoPoint = vrf.builders[idx].U_point.into();
        let V_point: RistrettoPoint = vrf.builders[idx].V_point.into();
        let u1 = vrf.builders[idx].u1.into();
        let u2 = vrf.builders[idx].u2.into();
        let invertee = vrf.builders[idx].invertee.into();
        let y = vrf.builders[idx].y.into();
        let z = vrf.builders[idx].z.into();
        let round = vrf.builders[idx].hash_points_round;
        vrf.builders[idx].hash_points_round += 1;
        if round == 0 {
            let (u1, u2, invertee, y, z) = ECVRF_hash_points_p1(&H_point);
            vrf.builders[idx].u1 = u1.into();
            vrf.builders[idx].u2 = u2.into();
            vrf.builders[idx].invertee = invertee.into();
            vrf.builders[idx].y = y.into();
            vrf.builders[idx].z = z.into();
        } else if round == 1 {
            let p1_bytes = ECVRF_hash_points_p2(&H_point, &u1, &u2, &invertee, &y, &z);
            vrf.builders[idx].p1_bytes = p1_bytes.try_into().unwrap();
        } else if round == 2 {
            let (u1, u2, invertee, y, z) = ECVRF_hash_points_p1(&proof.Gamma.into());
            vrf.builders[idx].u1 = u1.into();
            vrf.builders[idx].u2 = u2.into();
            vrf.builders[idx].invertee = invertee.into();
            vrf.builders[idx].y = y.into();
            vrf.builders[idx].z = z.into();
        } else if round == 3 {
            let p2_bytes = ECVRF_hash_points_p2(&proof.Gamma.into(), &u1, &u2, &invertee, &y, &z);
            vrf.builders[idx].p2_bytes = p2_bytes.try_into().unwrap();
        } else if round == 4 {
            let (u1, u2, invertee, y, z) = ECVRF_hash_points_p1(&U_point);
            vrf.builders[idx].u1 = u1.into();
            vrf.builders[idx].u2 = u2.into();
            vrf.builders[idx].invertee = invertee.into();
            vrf.builders[idx].y = y.into();
            vrf.builders[idx].z = z.into();
        } else if round == 5 {
            let p3_bytes = ECVRF_hash_points_p2(&U_point, &u1, &u2, &invertee, &y, &z);
            vrf.builders[idx].p3_bytes = p3_bytes.try_into().unwrap();
        } else if round == 6 {
            let (u1, u2, invertee, y, z) = ECVRF_hash_points_p1(&V_point);
            vrf.builders[idx].u1 = u1.into();
            vrf.builders[idx].u2 = u2.into();
            vrf.builders[idx].invertee = invertee.into();
            vrf.builders[idx].y = y.into();
            vrf.builders[idx].z = z.into();
        } else if round == 7 {
            let p4_bytes = ECVRF_hash_points_p2(&V_point, &u1, &u2, &invertee, &y, &z);
            vrf.builders[idx].p4_bytes = p4_bytes.try_into().unwrap();
        } else if round == 8 {
            let p1_bytes = vrf.builders[idx].p1_bytes;
            let p2_bytes = vrf.builders[idx].p2_bytes;
            let p3_bytes = vrf.builders[idx].p3_bytes;
            let p4_bytes = vrf.builders[idx].p4_bytes;
            let c_prime_hashbuf =
                ECVRF_hash_points_fini(&p1_bytes, &p2_bytes, &p3_bytes, &p4_bytes);
            vrf.builders[idx].c_prime_hashbuf = c_prime_hashbuf;
        } else if round == 9 {
            let c_prime_hashbuf = vrf.builders[idx].c_prime_hashbuf;
            let c_prime = ECVRF_ed25519_scalar_from_hash128(&c_prime_hashbuf);
            // // NOTE: this leverages constant-time comparison inherited from the Scalar impl
            vrf.builders[idx].verified = c_prime == proof.c;
            if vrf.builders[idx].verified {
                let mut hasher = Sha256::new();

                hasher.input(bytemuck::bytes_of(&vrf.builders[idx].proof.Gamma));
                let out: [u8; 32] = hasher.result()[..].try_into().unwrap();
                vrf.builders[idx].result.clone_from_slice(&out);
                vrf.current_round.num_verified += 1;
                Self::xor_in_place(&mut vrf.current_round.result, &out);
                emit!(VrfVerifyEvent {
                    vrf_pubkey: ctx.accounts.vrf.key(),
                    oracle_pubkey: ctx.accounts.oracle.key(),
                    authority_pubkey: ctx.accounts.oracle_authority.key(),
                    amount: 0,
                });
            }
            vrf.builders[idx].stage = 16;
            vrf.builders[idx].status = VrfStatus::StatusVerified;
        }
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn actuate_16(
        ctx: &Context<'_, '_, '_, 'info, VrfVerify<'info>>,
        params: &VrfVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        if vrf.current_round.num_verified < vrf.batch_size {
            return Err(error!(SwitchboardError::VrfInsufficientVerificationError));
        }
        // TODO: check status is explicitly verified instead? shouldnt matter.
        if vrf.status == VrfStatus::StatusCallbackSuccess {
            return Err(error!(SwitchboardError::VrfCallbackAlreadyCalledError));
        }
        let callback = vrf.callback;
        let mut accounts: Vec<AccountMeta> = Vec::with_capacity(callback.accounts_len as usize);
        // MUST MAKE SURE THESE ACCOUNTS MATCH WHATS IN THE CALLBACK
        for idx in 0..callback.accounts_len as usize {
            accounts.push(callback.accounts[idx].into());
        }
        let callback_instruction = Instruction {
            program_id: callback.program_id,
            data: callback.ix_data[..callback.ix_data_len as usize].to_vec(),
            accounts,
        };
        let mut account_infos = ctx.remaining_accounts.to_vec();
        account_infos.push(ctx.accounts.callback_pid.clone());
        vrf.status = VrfStatus::StatusCallbackSuccess;
        vrf.builders[idx].stage = 17;
        vrf.builders[idx].tx_remaining = vrf.builders[idx].tx_remaining.checked_sub(1).unwrap();
        drop(vrf);
        msg!("Invoking callback");
        invoke(&callback_instruction, &account_infos)?;
        emit!(VrfCallbackPerformedEvent {
            vrf_pubkey: ctx.accounts.vrf.key(),
            oracle_pubkey: ctx.accounts.oracle.key(),
            amount: 0,
        });
        Ok(())
    }
}
