use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use arrayref::array_ref;
use sha2::{Digest, Sha256};
use solana_program::native_token::LAMPORTS_PER_SOL;

#[derive(Accounts)]
#[instruction(params: VrfRequestRandomnessParams)] // rpc parameters hint
pub struct VrfRequestRandomness<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = oracle_queue, has_one = authority, has_one = escrow)]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    #[account(mut, has_one = data_buffer)]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: todo
    #[account(constraint = oracle_queue.load()?.authority == queue_authority.key()
         @ SwitchboardError::InvalidAuthorityError)]
    pub queue_authority: AccountInfo<'info>,
    /// CHECK: todo
    pub data_buffer: AccountInfo<'info>,
    #[account(mut, seeds = [PERMISSION_SEED,
        queue_authority.key().as_ref(),
        oracle_queue.key().as_ref(),
        vrf.key().as_ref()],
        bump = params.permission_bump)]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(mut, constraint = escrow.mint == oracle_queue.load()?.get_mint() && escrow.owner == program_state.key())]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut, constraint = payer_wallet.mint == oracle_queue.load()?.get_mint() &&
        payer_wallet.owner == payer_authority.key())]
    pub payer_wallet: Account<'info, TokenAccount>,
    pub payer_authority: Signer<'info>,
    /// CHECK: todo
    #[account(address = solana_program::sysvar::recent_blockhashes::ID)]
    pub recent_blockhashes: AccountInfo<'info>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfRequestRandomnessParams {
    pub permission_bump: u8,
    pub state_bump: u8,
}
impl VrfRequestRandomness<'_> {
    pub fn is_valid_request(
        ctx: &Context<VrfRequestRandomness>,
        _params: &VrfRequestRandomnessParams,
    ) -> Result<bool> {
        let vrf = ctx.accounts.vrf.load()?;
        if (vrf.status == VrfStatus::StatusRequesting
            || vrf.status == VrfStatus::StatusVerifying
            || vrf.status == VrfStatus::StatusVerified)
            && Clock::get()?.unix_timestamp - vrf.current_round.request_timestamp < 15
        {
            return Ok(false);
        }
        Ok(true)
    }

    pub fn validate(&self, ctx: &Context<Self>, params: &VrfRequestRandomnessParams) -> Result<()> {
        if !Self::is_valid_request(ctx, params)? {
            return Err(error!(SwitchboardError::VrfRequestAlreadyLaunchedError));
        }
        if !ctx.accounts.oracle_queue.load()?.unpermissioned_vrf_enabled
            && !(ctx.accounts.permission.load()?.permissions
                & SwitchboardPermission::PermitVrfRequests)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        assert_buffer_account(ctx.program_id, &ctx.accounts.data_buffer)?;
        Ok(())
    }

    // If beyond time or invalid status, withdraw all old funds to a withdraw wallet,
    // fund escrow to required point.
    pub fn actuate(
        ctx: &Context<VrfRequestRandomness>,
        _params: &VrfRequestRandomnessParams,
    ) -> Result<()> {
        let mut queue = ctx.accounts.oracle_queue.load_mut()?;
        // https://is.gd/FBCC8g
        let block_data = ctx.accounts.recent_blockhashes.data.borrow();
        let most_recent_blockhash = array_ref![block_data, 8, 32];
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let mut buf = ctx.accounts.data_buffer.try_borrow_mut_data()?;
        let buf = OracleQueueAccountData::convert_buffer(*buf);
        let mut hasher = Sha256::new();
        vrf.builders.iter_mut().for_each(|x| {
            *x = Default::default();
            x.tx_remaining = 277;
        });
        vrf.current_round = Default::default();

        vrf.counter = vrf.counter.checked_add(1).unwrap();
        let counter = vrf.counter;

        hasher.input(ctx.accounts.vrf.key().to_bytes());
        hasher.input(bytemuck::bytes_of(&counter));
        hasher.input(most_recent_blockhash);
        // SET ALPHA
        let alpha = &hasher.result()[..];
        vrf.current_round.alpha[..alpha.len()].clone_from_slice(alpha);
        vrf.current_round.alpha_len = alpha.len().try_into().unwrap();
        // SET BUILDERS
        let oracle_list = queue.next_n(buf, vrf.batch_size)?;
        // SET CLOCK
        let clock = Clock::get()?;
        vrf.current_round.request_timestamp = clock.unix_timestamp;
        vrf.current_round.request_slot = clock.slot;

        // TODO: make withdraw method too.
        let batch_size: u64 = vrf.batch_size.try_into().unwrap();
        let mut load_amount: u64 = (LAMPORTS_PER_SOL / 500) / 38;
        load_amount = load_amount * 38 * batch_size;
        let diff_amount = load_amount.saturating_sub(ctx.accounts.escrow.amount);
        emit!(VrfRequestRandomnessEvent {
            vrf_pubkey: ctx.accounts.vrf.key(),
            oracle_pubkeys: oracle_list.clone(),
            load_amount,
            existing_amount: ctx.accounts.escrow.amount,
            alpha: alpha.to_vec(),
            counter,
        });
        if diff_amount > 0 {
            transfer(
                &ctx.accounts.token_program,
                &ctx.accounts.payer_wallet,
                &ctx.accounts.escrow,
                &ctx.accounts.payer_authority,
                &[],
                diff_amount.try_into().unwrap(),
            )?;
        }
        vrf.status = VrfStatus::StatusRequesting;
        for (idx, oracle) in oracle_list.iter().enumerate() {
            vrf.builders[idx].producer = *oracle;
            vrf.builders[idx].status = VrfStatus::StatusRequesting;
        }
        vrf.builders_len = vrf.batch_size;

        Ok(())
    }
}
