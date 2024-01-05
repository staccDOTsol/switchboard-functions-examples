use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(Accounts)]
#[instruction(params: OracleQueueInitParams)] // rpc parameters hint
pub struct OracleQueueInit<'info> {
    #[account(init,
    space = OracleQueueAccountData::size(),
    payer = payer)]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: todo
    pub authority: AccountInfo<'info>,
    /// CHECK: todo
    #[account(mut)]
    pub buffer: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
    // #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub mint: Account<'info, Mint>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct OracleQueueInitParams {
    pub name: [u8; 32],
    pub metadata: [u8; 64],
    pub reward: u64,
    pub min_stake: u64,
    pub feed_probation_period: u32,
    pub oracle_timeout: u32,
    pub slashing_enabled: bool,
    pub variance_tolerance_multiplier: BorshDecimal,
    pub consecutive_feed_failure_limit: u64,
    pub consecutive_oracle_failure_limit: u64,
    pub queue_size: u32,
    pub unpermissioned_feeds: bool,
    pub unpermissioned_vrf: bool,
    pub enable_buffer_relayers: bool,
    pub enable_tee_only: bool,
}
impl OracleQueueInit<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &OracleQueueInitParams) -> Result<()> {
        assert_safe_zeroed(ctx.program_id, &ctx.accounts.buffer)?;
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &OracleQueueInitParams) -> Result<()> {
        ctx.accounts.buffer.try_borrow_mut_data()?[..8].clone_from_slice(BUFFER_DISCRIMINATOR);
        let mut queue = ctx.accounts.oracle_queue.load_init()?;
        let buffer_account_info = ctx.accounts.buffer.to_account_info();
        let buffer = buffer_account_info.try_borrow_data()?;
        let size = buffer[8..].len() / std::mem::size_of::<Pubkey>();
        queue.data_buffer = ctx.accounts.buffer.key();
        queue.max_size = size.try_into().unwrap();
        queue.authority = *ctx.accounts.authority.key;
        queue.name = params.name;
        queue.metadata = params.metadata;
        queue.slashing_enabled = params.slashing_enabled;
        queue.reward = params.reward;
        queue.min_stake = params.min_stake;
        queue.authority = *ctx.accounts.authority.key;
        queue.oracle_timeout = params.oracle_timeout;
        queue.feed_probation_period = params.feed_probation_period;
        queue.variance_tolerance_multiplier = params.variance_tolerance_multiplier.into();
        queue.consecutive_feed_failure_limit = params.consecutive_feed_failure_limit;
        queue.consecutive_oracle_failure_limit = params.consecutive_oracle_failure_limit;
        queue.unpermissioned_feeds_enabled = params.unpermissioned_feeds;
        queue.unpermissioned_vrf_enabled = params.unpermissioned_vrf;
        queue.mint = ctx.accounts.mint.key();
        queue.enable_buffer_relayers = params.enable_buffer_relayers;
        queue.enable_tee_only = params.enable_tee_only;
        Ok(())
    }
}
