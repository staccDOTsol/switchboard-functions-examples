use crate::actions::crank_pop_action::find_associated_token_address;
use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use solana_program::native_token::LAMPORTS_PER_SOL;
use std::collections::BTreeMap;

#[derive(Accounts)]
#[instruction(params: VrfPoolRequestParams)] // rpc parameters hint
pub struct VrfPoolRequest<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = queue,
        has_one = authority,
    )]
    pub vrf_pool: AccountLoader<'info, VrfPoolAccountData>,

    #[account(mut, 
        constraint = escrow.mint == queue.load()?.get_mint() && escrow.owner == program_state.key()
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        address = queue.load()?.get_mint()
     )]
    pub mint: Box<Account<'info, Mint>>,

    #[account(mut, 
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
    pub data_buffer: UncheckedAccount<'info>,
    /// CHECK: todo
    #[account(address = solana_program::sysvar::recent_blockhashes::ID)]
    pub recent_blockhashes: AccountInfo<'info>,
    /// CHECK: todo
    #[account(
        seeds = [STATE_SEED],
        bump = vrf_pool.load()?.state_bump
    )]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfPoolRequestParams {
    pub callback: Option<Callback>,
}

impl<'a> VrfPoolRequest<'a> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &VrfPoolRequestParams) -> Result<()> {
        msg!("vrf_pool_request validate");
        if ctx.remaining_accounts.len() < 3 {
            return Err(error!(SwitchboardError::ArrayOperationError));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &mut Context<'_, '_, '_, 'a, VrfPoolRequest<'a>>,
        params: &VrfPoolRequestParams,
    ) -> Result<()> {
        msg!("vrf_pool_request actuate");
        let clock = Clock::get()?;

        let vrf_pool_account_info = ctx.accounts.vrf_pool.to_account_info();
        let mut vrf_pool_account_data = vrf_pool_account_info.try_borrow_mut_data()?;
        let mut vrf_pool = VrfPool::new(*vrf_pool_account_data)?;
        let state_bump = vrf_pool.state_bump();
        let row = vrf_pool.get(clock.unix_timestamp)?;
        drop(vrf_pool);

        let find_result = Self::find_all_accounts(ctx, &row.pubkey);
        let _err = find_result.as_ref().err();
        if find_result.is_err() {
            msg!("VrfPool miss");
            return Err(error!(SwitchboardError::VrfPoolMiss));
            // let anchor_err = cast!(err.unwrap(), Error::AnchorError);
            // msg!("{:?}", find_result.err());
            // if anchor_err.is_some() {
            //     return Err(anchor_err.unwrap());
            // }
            // return Ok(());
        }

        // FIND ALL REQUIRED ACCOUNTS
        let (vrf, permission, mut escrow, _idx) = find_result?;

        let load_amount: u64 = LAMPORTS_PER_SOL / 400;
        if escrow.amount < load_amount {
            let diff_amount = load_amount.saturating_sub(escrow.amount);
            transfer(
                &ctx.accounts.token_program,
                &ctx.accounts.escrow,
                &escrow,
                &ctx.accounts.program_state.to_account_info(),
                &[&[STATE_SEED, &[state_bump]]],
                diff_amount.try_into().unwrap(),
            )?;
        }

        escrow.reload()?;

        // if permissions have been revoked, remove from pool
        if !ctx.accounts.queue.load()?.unpermissioned_vrf_enabled
            && !(permission.load()?.permissions & SwitchboardPermission::PermitVrfRequests)
        {
            msg!("permission account missing required permissions, removing from VRF Pool");
            let mut vrf_lite = vrf.load_mut()?;
            vrf_lite.vrf_pool = Pubkey::default();
            drop(vrf_lite);

            let mut vrf_pool = VrfPool::new(*vrf_pool_account_data)?;
            // we incremented this already when we initially popped
            let mut popped_idx = vrf_pool.idx();
            if popped_idx == 0 {
                popped_idx = vrf_pool.size() - 1;
            } else {
                popped_idx -= 1;
            }
            let popped_row = vrf_pool.pop_at_idx(popped_idx)?;
            assert_eq!(popped_row.pubkey, vrf.key());

            return Err(error!(SwitchboardError::PermissionDenied));
        }

        let mut accounts = Box::new(VrfLiteRequestRandomness {
            vrf_lite: Self::clone_loader(&vrf)?,
            authority: ctx.accounts.authority.clone(),
            queue: Self::clone_loader(&ctx.accounts.queue)?,
            escrow: *escrow.clone(),
            program_state: Self::clone_loader(&ctx.accounts.program_state)?,
            token_program: ctx.accounts.token_program.clone(),
            permission,
            queue_authority: ctx.accounts.queue_authority.to_account_info(),
            data_buffer: ctx.accounts.data_buffer.to_account_info().clone(),
            recent_blockhashes: ctx.accounts.recent_blockhashes.clone(),
        });
        let request_ctx = Context::new(ctx.program_id, accounts.as_mut(), &[], BTreeMap::new());

        let params = VrfLiteRequestRandomnessParams {
            callback: params.callback.clone(),
        };

        msg!("requesting randomness ...");

        switchboard_v2::vrf_lite_request_randomness(request_ctx, params)?;

        let vrf_lite = vrf.load()?;

        emit!(VrfPoolRequestEvent {
            queue_pubkey: ctx.accounts.queue.key(),
            vrf_pool_pubkey: ctx.accounts.vrf_pool.key(),
            vrf_pubkey: vrf.key(),
            oracle_pubkey: vrf_lite.builder.producer.key(),
            slot: clock.slot,
            timestamp: clock.unix_timestamp
        });

        Ok(())
    }

    pub fn clone_loader<T: ZeroCopy + anchor_lang::Owner>(
        l: &AccountLoader<'a, T>,
    ) -> Result<AccountLoader<'a, T>> {
        let account_info = l.to_account_info();
        AccountLoader::try_from(&account_info.clone())
    }

    pub fn find_account(
        ctx: &Context<'_, '_, '_, 'a, VrfPoolRequest<'a>>,
        key: &Pubkey,
    ) -> Option<(AccountInfo<'a>, usize)> {
        let idx = ctx
            .remaining_accounts
            .binary_search_by(|acc_info| acc_info.key.cmp(key))
            .ok();
        idx?;
        let idx = idx.unwrap();
        Some((ctx.remaining_accounts[idx].clone(), idx))
    }

    pub fn find_all_accounts(
        ctx: &Context<'_, '_, '_, 'a, VrfPoolRequest<'a>>,
        popped_key: &Pubkey,
    ) -> Result<(
        AccountLoader<'a, VrfLiteAccountData>,
        AccountLoader<'a, PermissionAccountData>,
        Box<Account<'a, TokenAccount>>,
        usize,
    )> {
        // load vrf
        let (vrf_account, idx) = Self::find_account(ctx, popped_key)
            .ok_or(error!(SwitchboardError::VrfAccountNotFound))?;
        let vrf_loader = AccountLoader::<'_, VrfLiteAccountData>::try_from(
            &vrf_account.to_account_info().clone(),
        )?;

        // load permissions
        let (permission_pubkey, _permission_seeds, _permission_bump) =
            PermissionAccountData::key_from_seed(
                ctx.program_id,
                ctx.accounts.queue_authority.key,
                &ctx.accounts.queue.key(),
                &vrf_account.key(),
                Some(vrf_loader.load()?.permission_bump),
            )
            .map_err(|_| error!(SwitchboardError::PermissionAccountDeriveFailure))?;
        let permission_account = Self::find_account(ctx, &permission_pubkey)
            .ok_or(error!(SwitchboardError::PermissionAccountNotFound))?
            .0;

        // load escrow
        let escrow_pubkey = vrf_loader.load()?.escrow;
        let aep = find_associated_token_address(&vrf_account.key(), &ctx.accounts.mint.key());
        if aep != escrow_pubkey {
            return Err(error!(SwitchboardError::InvalidEscrowAccount));
        }
        let escrow = Self::find_account(ctx, &escrow_pubkey)
            .ok_or(error!(SwitchboardError::EscrowAccountNotFound))?
            .0;

        Ok((
            vrf_loader,
            AccountLoader::try_from(&permission_account.to_account_info().clone())?,
            Box::new(Account::try_from(&escrow.to_account_info().clone())?),
            idx,
        ))
    }
}
