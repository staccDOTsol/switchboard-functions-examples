use crate::*;
use anchor_lang::prelude::*;

use anchor_spl::token::Token;
use hex;
use solana_program::program::invoke;
use solana_program::sysvar::instructions::load_current_index_checked;

#[derive(Accounts)]
#[instruction(params: VrfProveAndVerifyParams)] // rpc parameters hint
pub struct VrfProveAndVerify<'info> {
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
    pub oracle_authority: Signer<'info>,
    #[account(mut, constraint = oracle.load()?.token_account == oracle_wallet.key())]
    pub oracle_wallet: Account<'info, TokenAccount>,
    /// CHECK: todo
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfProveAndVerifyParams {
    pub nonce: Option<u32>,
    pub state_bump: u8,
    pub idx: u32,
    pub proof: Vec<u8>,
    pub proof_encoded: String,
    pub counter: u128,
}
impl<'info> VrfProveAndVerify<'info> {
    pub fn xor_in_place(a: &mut [u8; 32], b: &[u8; 32]) {
        for (b1, b2) in a.iter_mut().zip(b.iter()) {
            *b1 ^= *b2;
        }
    }

    pub fn validate(
        &self,
        ctx: &Context<'_, '_, '_, 'info, Self>,
        params: &VrfProveAndVerifyParams,
    ) -> Result<()> {
        let idx = params.idx as usize;
        let vrf = ctx.accounts.vrf.load()?;
        let ins_idx = load_current_index_checked(&ctx.accounts.instructions_sysvar)?;
        // Short circuit and mark as success
        if vrf.status == VrfStatus::StatusCallbackSuccess {
            if ins_idx == 0 {
                return Err(error!(SwitchboardError::VrfTooManyVerifyCallsError));
            }
            return Ok(());
        }
        if vrf.counter != params.counter {
            return Err(error!(SwitchboardError::InvalidVrfRound));
        }

        if params.idx > 8 || params.idx >= vrf.batch_size {
            return Err(error!(SwitchboardError::IndexOutOfBoundsError));
        }
        if vrf.builders[idx].producer != ctx.accounts.oracle.key() {
            msg!("validate");
            return Err(error!(SwitchboardError::VrfVerifyError));
        }

        // DO PROVING SCHEME INSTEAD
        if vrf.status == VrfStatus::StatusRequesting && vrf.builders[idx].stage == 0 {
            return Ok(());
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
        ctx: &Context<'_, '_, '_, 'info, Self>,
        params: &VrfProveAndVerifyParams,
    ) -> Result<bool> {
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let repr_proof = hex::decode(params.proof_encoded.clone()).unwrap();
        let alpha = vrf.current_round.alpha[..vrf.current_round.alpha_len as usize].to_vec();

        let input_status = vrf.builders[params.idx as usize].status;
        let input_stage = vrf.builders[params.idx as usize].stage;

        if input_status == VrfStatus::StatusCallbackSuccess {
            msg!("Callback already verified");
            return Ok(false);
        }

        if input_status == VrfStatus::StatusVerified {
            if vrf.callback.program_id != System::id() {
                let callback_instruction = vrf.get_callback_ixn();

                let mut account_infos = ctx.remaining_accounts.to_vec();
                account_infos.push(ctx.accounts.callback_pid.clone());

                vrf.status = VrfStatus::StatusCallbackSuccess;
                vrf.builders[params.idx as usize].stage = 17;
                vrf.builders[params.idx as usize].tx_remaining = vrf.builders[params.idx as usize]
                    .tx_remaining
                    .checked_sub(1)
                    .unwrap();
                drop(vrf);

                msg!("Invoking callback");
                invoke(&callback_instruction, &account_infos)?;

                emit!(VrfCallbackPerformedEvent {
                    vrf_pubkey: ctx.accounts.vrf.key(),
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

        vrf.builders[params.idx as usize].actuate(&VrfBuilderCtx {
            repr_proof,
            alpha,
            vrf_pubkey: ctx.accounts.vrf.key(),
            oracle_pubkey: ctx.accounts.oracle.key(),
            authority_pubkey: ctx.accounts.oracle_authority.key(),
        })?;

        vrf.status = vrf.builders[params.idx as usize].status;

        let output_status = vrf.builders[params.idx as usize].status;
        let output_stage = vrf.builders[params.idx as usize].stage;

        if input_stage != output_stage {
            msg!("stage: {:?} -> {:?}", input_stage, output_stage);
        }
        if input_status != output_status {
            msg!("status: {:?} -> {:?}", input_status, output_status);
        }

        if vrf.builders[params.idx as usize].result != [0u8; 32] {
            let result = vrf.builders[params.idx as usize].result;
            vrf.current_round.result.clone_from_slice(&result);
        }

        if input_status == VrfStatus::StatusVerifying && output_status == VrfStatus::StatusVerified
        {
            msg!("Verified!");
        }

        Ok(true)
    }
}
