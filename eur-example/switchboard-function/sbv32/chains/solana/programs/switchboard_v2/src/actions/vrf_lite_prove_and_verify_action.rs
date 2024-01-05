use crate::*;
use anchor_lang::prelude::*;

use anchor_spl::token::Token;
use solana_program::program::invoke;
use solana_program::sysvar::instructions::load_current_index_checked;

#[derive(Accounts)]
#[instruction(params: VrfLiteProveAndVerifyParams)] // rpc parameters hint
pub struct VrfLiteProveAndVerify<'info> {
    #[account(mut, has_one = escrow)]
    pub vrf_lite: AccountLoader<'info, VrfLiteAccountData>,
    /// CHECK: todo
    pub callback_pid: AccountInfo<'info>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(mut, constraint =
        escrow.mint == oracle_wallet.mint && escrow.owner == program_state.key())]
    pub escrow: Account<'info, TokenAccount>,
    #[account(seeds = [STATE_SEED], bump = vrf_lite.load()?.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(has_one = oracle_authority)]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    pub oracle_authority: Signer<'info>,
    #[account(mut, constraint = oracle.load()?.token_account == oracle_wallet.key())]
    pub oracle_wallet: Account<'info, TokenAccount>,
    /// CHECK: todo
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfLiteProveAndVerifyParams {
    pub nonce: Option<u32>,
    pub proof: Vec<u8>,
    pub proof_encoded: String,
    pub counter: u128,
}

impl<'info> VrfLiteProveAndVerify<'info> {
    pub fn validate(
        &self,
        ctx: &Context<'_, '_, '_, 'info, Self>,
        params: &VrfLiteProveAndVerifyParams,
    ) -> Result<()> {
        let vrf_lite = ctx.accounts.vrf_lite.load()?;
        let ins_idx = load_current_index_checked(&ctx.accounts.instructions_sysvar)?;
        // Short circuit and mark as success
        if vrf_lite.status == VrfStatus::StatusCallbackSuccess {
            if ins_idx == 0 {
                return Err(error!(SwitchboardError::VrfTooManyVerifyCallsError));
            }
            return Ok(());
        }
        if vrf_lite.counter != params.counter {
            return Err(error!(SwitchboardError::InvalidVrfRound));
        }

        if vrf_lite.builder.producer != ctx.accounts.oracle.key() {
            msg!("validate");
            return Err(error!(SwitchboardError::VrfVerifyError));
        }

        // DO PROVING SCHEME INSTEAD
        if vrf_lite.status == VrfStatus::StatusRequesting && vrf_lite.builder.stage == 0 {
            return Ok(());
        }

        if vrf_lite.status != VrfStatus::StatusVerifying
            && vrf_lite.status != VrfStatus::StatusVerified
        {
            msg!("1");
            return Err(error!(SwitchboardError::VrfVerifyError));
        }
        // LAST one would be VERIFIED status
        if vrf_lite.status != VrfStatus::StatusVerifying
            && vrf_lite.status != VrfStatus::StatusVerified
        {
            msg!("2");
            return Err(error!(SwitchboardError::VrfVerifyError));
        }
        if ctx.remaining_accounts.len() != vrf_lite.callback.accounts_len as usize {
            msg!("incorrect number of callback accounts");
            return Err(error!(SwitchboardError::VrfCallbackParamsError));
        }
        if ctx.accounts.callback_pid.key() != vrf_lite.callback.program_id {
            msg!("incorrect callback pid");
            return Err(error!(SwitchboardError::VrfCallbackParamsError));
        }
        for idx in 0..ctx.remaining_accounts.len() {
            if ctx.remaining_accounts[idx].key() != vrf_lite.callback.accounts[idx].pubkey {
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
        ctx: &Context<'_, '_, '_, 'info, Self>,
        params: &VrfLiteProveAndVerifyParams,
    ) -> Result<bool> {
        let mut vrf_lite = ctx.accounts.vrf_lite.load_mut()?;
        let repr_proof = hex::decode(params.proof_encoded.clone()).unwrap();
        let alpha = vrf_lite.alpha[..vrf_lite.alpha_len as usize].to_vec();

        let input_status = vrf_lite.builder.status;
        let input_stage = vrf_lite.builder.stage;

        if input_status == VrfStatus::StatusCallbackSuccess {
            msg!("Callback already verified");
            return Ok(false);
        }

        if input_status == VrfStatus::StatusVerified {
            if vrf_lite.callback.program_id != System::id() {
                let callback_instruction = vrf_lite.get_callback_ixn();

                let mut account_infos = ctx.remaining_accounts.to_vec();
                account_infos.push(ctx.accounts.callback_pid.clone());

                vrf_lite.status = VrfStatus::StatusCallbackSuccess;
                vrf_lite.builder.stage = 17;
                vrf_lite.builder.tx_remaining =
                    vrf_lite.builder.tx_remaining.checked_sub(1).unwrap();
                drop(vrf_lite);

                msg!("Invoking callback");
                invoke(&callback_instruction, &account_infos)?;

                emit!(VrfCallbackPerformedEvent {
                    vrf_pubkey: ctx.accounts.vrf_lite.key(),
                    oracle_pubkey: ctx.accounts.oracle.key(),
                    amount: 0,
                });

                return Ok(true);
            }

            msg!("No callback specified");
            return Ok(false);
        }

        msg!(
            "builder actuate: status = {:?}, stage = {:?}",
            input_status,
            input_stage
        );

        vrf_lite.builder.actuate(&VrfBuilderCtx {
            repr_proof,
            alpha,
            vrf_pubkey: ctx.accounts.vrf_lite.key(),
            oracle_pubkey: ctx.accounts.oracle.key(),
            authority_pubkey: ctx.accounts.oracle_authority.key(),
        })?;

        vrf_lite.status = vrf_lite.builder.status;
        let output_status = vrf_lite.builder.status;
        let output_stage = vrf_lite.builder.stage;

        if input_stage != output_stage {
            msg!("stage: {:?} -> {:?}", input_stage, output_stage);
        }
        if input_status != output_status {
            msg!("status: {:?} -> {:?}", input_status, output_status);
        }

        if vrf_lite.builder.result != [0u8; 32] {
            let result = vrf_lite.builder.result;
            vrf_lite.result.clone_from_slice(&result);
        }

        if input_status == VrfStatus::StatusVerifying && output_status == VrfStatus::StatusVerified
        {
            msg!("Verified!");
        }

        Ok(true)
    }
}
