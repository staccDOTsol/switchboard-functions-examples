use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
#[instruction(params: VrfLiteInitParams)] // rpc parameters hint

pub struct VrfLiteInit<'info> {
    /// CHECK: todo
    pub authority: AccountInfo<'info>,
    #[account(
        init, 
        space = VrfLiteAccountData::size(),
        payer = payer
    )]
    pub vrf: AccountLoader<'info, VrfLiteAccountData>,

    #[account(
        address = queue.load()?.get_mint()
     )]
    pub mint: Account<'info, Mint>,

    // should we make this an associated token account?
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = vrf,

    )]
    pub escrow: Account<'info, TokenAccount>,

    #[account(
        constraint = queue.load()?.authority == queue_authority.key() 
            @ SwitchboardError::InvalidAuthorityError 
    )]
    /// CHECK:
    pub queue_authority: AccountInfo<'info>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    #[account(
        init,
        seeds = [
            PERMISSION_SEED,
            queue_authority.key().as_ref(),
            queue.key().as_ref(),
            vrf.key().as_ref()
        ],
        bump,
        space = PermissionAccountData::size(),
        payer = payer
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,

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
pub struct VrfLiteInitParams {
    callback: Option<Callback>,
    state_bump: u8,
    expiration: Option<i64>,
}
impl VrfLiteInit<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &VrfLiteInitParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<VrfLiteInit>, params: &VrfLiteInitParams) -> Result<()> {
        let mut vrf = ctx.accounts.vrf.load_init()?;
        vrf.authority = ctx.accounts.authority.key();
        vrf.queue = ctx.accounts.queue.key();
        vrf.escrow = ctx.accounts.escrow.key();
        vrf.expiration = params.expiration.unwrap_or(0);
        vrf.state_bump = params.state_bump;
        vrf.permission_bump = *ctx.bumps.get("permission").unwrap();
        if let Some(callback) = &params.callback {
            vrf.callback = callback.clone().into();
        }
        drop(vrf);

        let mut permission = ctx.accounts.permission.load_init()?;
        permission.authority = ctx.accounts.queue_authority.key();
        permission.granter = ctx.accounts.queue.key();
        permission.grantee = ctx.accounts.vrf.key();
        permission.bump = *ctx.bumps.get("permission").unwrap();
        permission.expiration = params.expiration.unwrap_or(0);
        drop(permission);

        token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    account_or_mint: ctx.accounts.escrow.to_account_info().clone(),
                    current_authority: ctx.accounts.vrf.to_account_info().clone(),
                },
            ),
            AuthorityType::AccountOwner,
            Some(ctx.accounts.program_state.key()),
        )?;

        Ok(())
    }
}
