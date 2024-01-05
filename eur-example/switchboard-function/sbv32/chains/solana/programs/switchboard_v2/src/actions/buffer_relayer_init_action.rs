use crate::*;

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: BufferRelayerInitParams)] // rpc parameters hint
pub struct BufferRelayerInit<'info> {
    #[account(zero)]
    pub buffer_relayer: Box<Account<'info, BufferRelayerAccountData>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = buffer_relayer,
    )]
    pub escrow: Account<'info, TokenAccount>,
    /// CHECK: new authority
    pub authority: AccountInfo<'info>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    pub job: Account<'info, JobAccountData>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(address = queue.load()?.get_mint())]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct BufferRelayerInitParams {
    pub name: [u8; 32],
    pub min_update_delay_seconds: u32,
    pub state_bump: u8,
}
impl BufferRelayerInit<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &BufferRelayerInitParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &mut Context<BufferRelayerInit>,
        params: &BufferRelayerInitParams,
    ) -> Result<()> {
        ctx.accounts
            .buffer_relayer
            .name
            .clone_from_slice(&params.name);
        ctx.accounts.buffer_relayer.min_update_delay_seconds = params.min_update_delay_seconds;
        ctx.accounts.buffer_relayer.queue_pubkey = ctx.accounts.queue.key();
        ctx.accounts.buffer_relayer.authority = ctx.accounts.authority.key();
        ctx.accounts.buffer_relayer.escrow = ctx.accounts.escrow.key();
        ctx.accounts.buffer_relayer.job_pubkey = ctx.accounts.job.key();
        ctx.accounts.buffer_relayer.authority = ctx.accounts.authority.key();
        ctx.accounts
            .buffer_relayer
            .job_hash
            .clone_from_slice(&ctx.accounts.job.hash);
        let cpi_accounts = SetAuthority {
            account_or_mint: ctx.accounts.escrow.to_account_info().clone(),
            current_authority: ctx.accounts.buffer_relayer.to_account_info().clone(),
        };
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                &[],
            ),
            AuthorityType::AccountOwner,
            Some(ctx.accounts.program_state.key()),
        )?;
        Ok(())
    }
}
