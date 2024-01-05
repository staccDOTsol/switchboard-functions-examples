use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use solana_program::program_option::COption;

#[derive(Accounts)]
#[instruction(params: OracleInitParams)]
pub struct OracleInit<'info> {
    #[account(
        init,
        seeds = [
            ORACLE_SEED,
            queue.key().as_ref(),
            wallet.key().as_ref(),
        ],
        bump,
        space = OracleAccountData::size(),
        payer = payer)]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    // SECURITY NOTE: For vrf security, this must forever be immutable OR make
    // a separate vrf key!
    /// CHECK: todo
    pub oracle_authority: AccountInfo<'info>,
    #[account(constraint =
        wallet.mint == queue.load()?.get_mint() &&
        wallet.owner == program_state.key() &&
        wallet.delegate == COption::None &&
        wallet.close_authority == COption::None)]
    pub wallet: Account<'info, TokenAccount>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct OracleInitParams {
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub state_bump: u8,
    pub oracle_bump: u8,
}
impl OracleInit<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &OracleInitParams) -> Result<()> {
        // Trigger discriminator check.
        ctx.accounts.queue.load()?;
        // if !ctx.accounts.oracle_authority.key().is_on_curve() {
        // return Err(error!(SwitchboardError::AuthorityOffCurveError));
        // }
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &OracleInitParams) -> Result<()> {
        let mut oracle = ctx.accounts.oracle.load_init()?;
        oracle.bump = *ctx.bumps.get("oracle").unwrap();
        let clock = Clock::get()?;
        let mut name = params.name.clone();
        let mut metadata = params.metadata.clone();
        name.resize(32, 0u8);
        metadata.resize(128, 0u8);
        oracle.name.clone_from_slice(name.as_slice());
        oracle.metadata.clone_from_slice(metadata.as_slice());
        oracle.oracle_authority = ctx.accounts.oracle_authority.key();
        oracle.last_heartbeat = clock.unix_timestamp;
        oracle.num_in_use = 0;
        oracle.token_account = ctx.accounts.wallet.key();
        oracle.queue_pubkey = ctx.accounts.queue.key();
        Ok(())
    }
}
