use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use arrayref::array_ref;
use sha2::{Digest, Sha256};
use solana_program::native_token::LAMPORTS_PER_SOL;

#[derive(Accounts)]
#[instruction(params: VrfLiteRequestRandomnessParams)] // rpc parameters hint
pub struct VrfLiteRequestRandomness<'info> {
    pub authority: Signer<'info>,
    #[account(mut, 
        has_one = queue, 
        has_one = authority, 
        has_one = escrow
    )]
    pub vrf_lite: AccountLoader<'info, VrfLiteAccountData>,

    #[account(
        mut, 
        has_one = data_buffer
    )]
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: todo
    #[account(
        constraint = 
            queue.load()?.authority == queue_authority.key() @ SwitchboardError::InvalidAuthorityError
        )]
    pub queue_authority: AccountInfo<'info>,
    /// CHECK: todo
    pub data_buffer: AccountInfo<'info>,
    #[account(
        mut, 
        seeds = [
            PERMISSION_SEED,
            queue_authority.key().as_ref(),
            queue.key().as_ref(),
            vrf_lite.key().as_ref()
        ],
        bump = vrf_lite.load()?.permission_bump
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(mut, 
        constraint = escrow.mint == queue.load()?.get_mint() && escrow.owner == program_state.key()
    )]
    pub escrow: Account<'info, TokenAccount>,
    /// CHECK: todo
    #[account(address = solana_program::sysvar::recent_blockhashes::ID)]
    pub recent_blockhashes: AccountInfo<'info>,
    #[account(
        seeds = [STATE_SEED], 
        bump = vrf_lite.load()?.state_bump
    )]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfLiteRequestRandomnessParams {
    pub callback: Option<Callback>,
}

impl VrfLiteRequestRandomness<'_> {
    pub fn is_valid_request(
        ctx: &Context<VrfLiteRequestRandomness>,
        _params: &VrfLiteRequestRandomnessParams,
    ) -> Result<bool> {
        let vrf_lite = ctx.accounts.vrf_lite.load()?;
        if (vrf_lite.status == VrfStatus::StatusRequesting
            || vrf_lite.status == VrfStatus::StatusVerifying
            || vrf_lite.status == VrfStatus::StatusVerified)
            && Clock::get()?.unix_timestamp - vrf_lite.request_timestamp < 15
        {
            return Ok(false);
        }
        Ok(true)
    }

    pub fn validate(
        &self,
        ctx: &Context<Self>,
        params: &VrfLiteRequestRandomnessParams,
    ) -> Result<()> {
        if !Self::is_valid_request(ctx, params)? {
            return Err(error!(SwitchboardError::VrfRequestAlreadyLaunchedError));
        }

        let load_amount: u64 = LAMPORTS_PER_SOL / 500;
        if ctx.accounts.escrow.amount < load_amount {
            return Err(error!(SwitchboardError::InsufficientTokenBalance));
        }

        if !ctx.accounts.queue.load()?.unpermissioned_vrf_enabled
            && !(ctx.accounts.permission.load()?.permissions
                & SwitchboardPermission::PermitVrfRequests)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }

        assert_buffer_account(&ctx.program_id, &ctx.accounts.data_buffer)?;
        Ok(())
    }

    // If beyond time or invalid status, withdraw all old funds to a withdraw wallet,
    // fund escrow to required point.
    pub fn actuate(
        ctx: &Context<VrfLiteRequestRandomness>,
        params: &VrfLiteRequestRandomnessParams,
    ) -> Result<()> {
        let mut queue = ctx.accounts.queue.load_mut()?;
        // https://is.gd/FBCC8g
        let block_data = ctx.accounts.recent_blockhashes.data.borrow();
        let most_recent_blockhash = array_ref![block_data, 8, 32];
        let mut vrf_lite = ctx.accounts.vrf_lite.load_mut()?;

        if let Some(callback) = params.callback.as_ref() {
            vrf_lite.callback = callback.clone().into();
        }

        let mut buf = ctx.accounts.data_buffer.try_borrow_mut_data()?;
        let buf = OracleQueueAccountData::convert_buffer(*buf);
        let mut hasher = Sha256::new();
        vrf_lite.result = [0u8; 32];
        vrf_lite.builder = VrfBuilder::default();
        vrf_lite.builder.tx_remaining = 277;
        vrf_lite.alpha = [0u8; 256];

        vrf_lite.counter = vrf_lite.counter.checked_add(1).unwrap();
        let counter = vrf_lite.counter;

        hasher.input(ctx.accounts.vrf_lite.key().to_bytes());
        hasher.input(bytemuck::bytes_of(&counter));
        hasher.input(most_recent_blockhash);
        // SET ALPHA
        let alpha = &hasher.result()[..];
        vrf_lite.alpha[..alpha.len()].clone_from_slice(alpha);
        vrf_lite.alpha_len = alpha.len().try_into().unwrap();
        // SET BUILDERS
        let oracle = queue.next_n(buf, 1)?[0];
        // SET CLOCK
        let clock = Clock::get()?;
        vrf_lite.request_timestamp = clock.unix_timestamp;
        vrf_lite.request_slot = clock.slot;

        // TODO: make withdraw method too.
        let mut load_amount: u64 = (LAMPORTS_PER_SOL / 500) / 38;
        load_amount *= 38;
        // let diff_amount = load_amount.saturating_sub(ctx.accounts.escrow.amount);
        emit!(VrfRequestRandomnessEvent {
            vrf_pubkey: ctx.accounts.vrf_lite.key(),
            oracle_pubkeys: vec![oracle],
            load_amount,
            existing_amount: ctx.accounts.escrow.amount,
            alpha: alpha.to_vec(),
            counter,
        });
        vrf_lite.status = VrfStatus::StatusRequesting;
        vrf_lite.builder.producer = oracle;
        vrf_lite.builder.status = VrfStatus::StatusRequesting;

        Ok(())
    }
}
