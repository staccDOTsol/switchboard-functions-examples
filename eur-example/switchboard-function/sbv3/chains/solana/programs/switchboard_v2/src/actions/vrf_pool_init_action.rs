use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
#[instruction(params: VrfPoolInitParams)] // rpc parameters hint
pub struct VrfPoolInit<'info> {
    /// CHECK:
    pub authority: AccountInfo<'info>,
    #[account(zero)]
    pub vrf_pool: AccountLoader<'info, VrfPoolAccountData>,

    pub queue: AccountLoader<'info, OracleQueueAccountData>,

    #[account(
       address = queue.load()?.get_mint()
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = vrf_pool,
    )]
    pub escrow: Account<'info, TokenAccount>,

    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
    /// CHECK:
    #[account(address = solana_program::sysvar::rent::ID)]
    pub rent: AccountInfo<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfPoolInitParams {
    pub max_rows: u32,
    pub min_interval: u32,
    pub state_bump: u8,
}

impl VrfPoolInit<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, params: &VrfPoolInitParams) -> Result<()> {
        if params.max_rows == 0 {
            return Err(error!(SwitchboardError::VrfPoolFull));
        }
        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &VrfPoolInitParams) -> Result<()> {
        let mut vrf_pool = ctx.accounts.vrf_pool.load_init()?;

        vrf_pool.authority = ctx.accounts.authority.key();
        vrf_pool.queue = ctx.accounts.queue.key();
        vrf_pool.escrow = ctx.accounts.escrow.key();

        vrf_pool.state_bump = params.state_bump;
        vrf_pool.min_interval = params.min_interval;
        vrf_pool.max_rows = params.max_rows;

        drop(vrf_pool);

        token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    account_or_mint: ctx.accounts.escrow.to_account_info().clone(),
                    current_authority: ctx.accounts.vrf_pool.to_account_info().clone(),
                },
            ),
            AuthorityType::AccountOwner,
            Some(ctx.accounts.program_state.key()),
        )?;

        let vrf_account_info = ctx.accounts.vrf_pool.to_account_info();
        let mut vrf_account_data = vrf_account_info.try_borrow_mut_data()?;
        let _vrf_pool = VrfPool {
            data: *vrf_account_data,
        };

        Ok(())
    }
}
