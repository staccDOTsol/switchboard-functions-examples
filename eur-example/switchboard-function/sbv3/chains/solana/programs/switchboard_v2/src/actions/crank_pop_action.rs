use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use std::collections::BTreeMap;

macro_rules! cast {
    ($target: expr, $pat: path) => {
        if let $pat(a) = $target {
            Some(a)
        } else {
            None
        }
    };
}

fn is_fatal_err(err: &Option<anchor_lang::error::Error>) -> bool {
    if err.is_none() {
        return false;
    }
    let err = cast!(err.as_ref().unwrap(), Error::AnchorError);
    if err.is_none() {
        return false;
    }
    let err = err.unwrap();
    // if one of these accounts isnt owned by switchboard (not created yet) then it should be booted
    if err.error_name == "AccountOwnedByWrongProgram" && err.error_code_number == 3007 {
        return true;
    }
    let permission_denied_err = error!(SwitchboardError::PermissionDenied);
    let queue_mismatch_err = error!(SwitchboardError::OracleQueueMismatch);
    let insufficient_funds_err = error!(SwitchboardError::AggregatorLeaseInsufficientFunds);
    let no_jobs_found_err = error!(SwitchboardError::NoAggregatorJobsFound);
    [
        permission_denied_err,
        queue_mismatch_err,
        insufficient_funds_err,
        no_jobs_found_err,
    ]
    .iter()
    .any(|other| {
        cast!(other, Error::AnchorError).unwrap().error_code_number == err.error_code_number
    })
}

fn is_error_reschedulable(err: &Option<anchor_lang::error::Error>) -> bool {
    if err.is_none() {
        return true;
    }
    let err = cast!(err.as_ref().unwrap(), Error::AnchorError);
    if err.is_none() {
        return true;
    }
    let err = err.unwrap();
    let illegal_round_open_err = error!(SwitchboardError::AggregatorIllegalRoundOpenCall);
    let insufficient_oracles_err = error!(SwitchboardError::InsufficientOracleQueueError);
    [illegal_round_open_err, insufficient_oracles_err]
        .iter()
        .any(|other| {
            cast!(other, Error::AnchorError).unwrap().error_code_number == err.error_code_number
        })
}
pub fn find_associated_token_address(key: &Pubkey, mint: &Pubkey) -> Pubkey {
    let (akey, _) = Pubkey::find_program_address(
        &[key.as_ref(), anchor_spl::token::ID.as_ref(), mint.as_ref()],
        &ATOKEN_PID,
    );
    akey
}

#[derive(Accounts)]
#[instruction(params: CrankPopParams)] // rpc parameters hint
pub struct CrankPop<'info> {
    #[account(mut, constraint = crank.load()?.data_buffer == crank_data_buffer.key())]
    pub crank: AccountLoader<'info, CrankAccountData>,
    #[account(mut, constraint = crank.load()?.queue_pubkey == oracle_queue.key()
        && oracle_queue.load()?.data_buffer == queue_data_buffer.key())]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: todo
    #[account(constraint = oracle_queue.load()?.authority == queue_authority.key()
        @ SwitchboardError::InvalidAuthorityError)]
    pub queue_authority: AccountInfo<'info>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(mut, constraint = payout_wallet.mint == oracle_queue.load()?.get_mint())]
    pub payout_wallet: Account<'info, TokenAccount>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    /// CHECK: todo
    #[account(mut)]
    pub crank_data_buffer: AccountInfo<'info>,
    /// CHECK: todo
    pub queue_data_buffer: AccountInfo<'info>,
    #[account(address = oracle_queue.load()?.get_mint())]
    pub mint: Account<'info, Mint>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct CrankPopParams {
    pub state_bump: u8,
    pub lease_bumps: Vec<u8>,
    pub permission_bumps: Vec<u8>,
    pub nonce: Option<u32>,
    pub fail_open_on_account_mismatch: Option<bool>,
    // pub pop_idx: Option<u32>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct CrankPopParamsV2 {
    pub state_bump: u8,
    pub lease_bumps: Vec<u8>,
    pub permission_bumps: Vec<u8>,
    pub nonce: Option<u32>,
    pub fail_open_on_account_mismatch: Option<bool>,
    pub pop_idx: Option<u32>,
}
impl<'a> CrankPop<'a> {
    pub fn clone_loader<T: ZeroCopy + anchor_lang::Owner>(
        l: &AccountLoader<'a, T>,
    ) -> Result<AccountLoader<'a, T>> {
        let account_info = l.to_account_info();
        AccountLoader::try_from(&account_info.clone())
    }

    pub fn find_account(
        ctx: &Context<'_, '_, '_, 'a, CrankPop<'a>>,
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
        ctx: &Context<'_, '_, '_, 'a, CrankPop<'a>>,
        params: &CrankPopParamsV2,
        popped_key: &Pubkey,
    ) -> Result<(
        AccountLoader<'a, AggregatorAccountData>,
        AccountLoader<'a, LeaseAccountData>,
        AccountLoader<'a, PermissionAccountData>,
        Box<Account<'a, TokenAccount>>,
        usize,
    )> {
        let (aggregator_account, idx) = Self::find_account(ctx, popped_key)
            .ok_or(error!(SwitchboardError::AggregatorAccountNotFound))?;
        let aggregator_loader = AccountLoader::<'_, AggregatorAccountData>::try_from(
            &aggregator_account.to_account_info().clone(),
        )?;
        let (permission_pubkey, _permission_seeds, _permission_bump) =
            PermissionAccountData::key_from_seed(
                ctx.program_id,
                ctx.accounts.queue_authority.key,
                &ctx.accounts.oracle_queue.key(),
                &aggregator_account.key(),
                Some(params.permission_bumps[idx]),
            )
            .map_err(|_| error!(SwitchboardError::PermissionAccountDeriveFailure))?;
        let permission_account = Self::find_account(ctx, &permission_pubkey)
            .ok_or(error!(SwitchboardError::PermissionAccountNotFound))?
            .0;

        let aggregator_key = aggregator_account.key();
        let queue_key = ctx.accounts.oracle_queue.key();
        let (lease_pubkey, _lease_seeds, _lease_bump) = LeaseAccountData::key_from_seed(
            ctx.program_id,
            &queue_key,
            &aggregator_key,
            Some(params.lease_bumps[idx]),
        )
        .map_err(|_| error!(SwitchboardError::LeaseAccountDeriveFailure))?;
        let lease = Self::find_account(ctx, &lease_pubkey)
            .ok_or(error!(SwitchboardError::LeaseAccountNotFound))?
            .0;
        let lease_loader =
            AccountLoader::<'_, LeaseAccountData>::try_from(&lease.to_account_info().clone())?;
        let escrow_pubkey = lease_loader.load()?.escrow;
        let aep = find_associated_token_address(&lease_pubkey, &ctx.accounts.mint.key());
        if aep != escrow_pubkey {
            return Err(error!(SwitchboardError::InvalidEscrowAccount));
        }

        let escrow = Self::find_account(ctx, &escrow_pubkey)
            .ok_or(error!(SwitchboardError::EscrowAccountNotFound))?
            .0;
        Ok((
            aggregator_loader,
            AccountLoader::try_from(&lease.to_account_info().clone())?,
            AccountLoader::try_from(&permission_account.to_account_info().clone())?,
            Box::new(Account::try_from(&escrow.to_account_info().clone())?),
            idx,
        ))
    }

    pub fn validate(&self, ctx: &Context<Self>, _params: &CrankPopParamsV2) -> Result<()> {
        assert_buffer_account(ctx.program_id, &ctx.accounts.queue_data_buffer)?;
        assert_buffer_account(ctx.program_id, &ctx.accounts.crank_data_buffer)?;
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<'_, '_, '_, 'a, CrankPop<'a>>,
        params: &CrankPopParamsV2,
    ) -> Result<()> {
        // POP CURRENT CRANK KEY
        let crank_key = ctx.accounts.crank.key();
        let mut crank = ctx.accounts.crank.load_mut()?;
        let mut buf = ctx.accounts.crank_data_buffer.try_borrow_mut_data()?;
        let buf = CrankAccountData::convert_buffer(*buf);
        let pop_idx = params.pop_idx.unwrap_or(0) as usize;
        let popped_row = crank.peak(buf, pop_idx)?;
        let (popped_key, allowed_timestamp) = (popped_row.pubkey, popped_row.next_timestamp);
        msg!(
            "Initiating Crank Pop @ {:?} = [{:?}, {:?}]",
            Clock::get()?.unix_timestamp,
            allowed_timestamp,
            popped_key
        );
        let find_result = Self::find_all_accounts(ctx, params, &popped_key);
        let err = find_result.as_ref().err();
        if find_result.is_err() && params.fail_open_on_account_mismatch.unwrap_or(false) {
            let anchor_err = cast!(err.unwrap(), Error::AnchorError);
            // InvalidEscrowAccount
            if anchor_err.is_some() && anchor_err.unwrap().error_code_number == 6025 {
                crank.pop(buf, pop_idx)?;
            }
            // AccountOwnedByWrongProgram
            if anchor_err.is_some() && anchor_err.unwrap().error_code_number == 3007 {
                crank.pop(buf, pop_idx)?;
            }
            msg!("{:?}", find_result.err());
            msg!("Crank pop miss.");
            return Ok(());
        }
        // FIND ALL REQUIRED ACCOUNTS
        let (aggregator, lease, permission, escrow, idx) = find_result?;

        // First stanza ensures no external open round calls occured which
        // we need to fix up in next pop.
        if aggregator.load()?.next_allowed_update_time == allowed_timestamp
            && allowed_timestamp > Clock::get()?.unix_timestamp
        {
            if params.fail_open_on_account_mismatch.unwrap_or(false) {
                return Ok(());
            }
            return Err(error!(SwitchboardError::CrankNoElementsReadyError));
        }

        crank.pop(buf, pop_idx)?;
        if aggregator.load()?.disable_crank {
            msg!("Crank disbaled for feed");
            return Ok(());
        }

        let aggregator_key = aggregator.key();
        // TODO(mgild): temporary backfill.
        if aggregator.load()?.crank_pubkey == Pubkey::default() {
            aggregator.load_mut()?.crank_pubkey = ctx.accounts.crank.key();
        }

        // Crank was changed.
        // Remove aggregator from the crank and dont re-push or call round open.
        if aggregator.load()?.crank_pubkey != ctx.accounts.crank.key() {
            lease.load_mut()?.crank_row_count = 0;
            msg!("Crank no-op");
            return Ok(());
        }

        // Crank is disabled on this aggregator.
        // Remove aggregator from the crank and dont re-push or call round open.
        if aggregator.load()?.disable_crank {
            lease.load_mut()?.crank_row_count = 0;
            aggregator.load_mut()?.crank_pubkey = Pubkey::default();
            msg!("Crank no-op");
            return Ok(());
        }

        // if round still open, reschedule
        if aggregator
            .load()?
            .active_round(Clock::get()?.unix_timestamp)
        {
            let next_allowed_update_time = Clock::get()?
                .unix_timestamp
                .checked_add(10)
                .ok_or(error!(SwitchboardError::IntegerOverflowError))?
                .checked_add(crank.jitter_modifier.into())
                .ok_or(error!(SwitchboardError::IntegerOverflowError))?;
            aggregator.load_mut()?.next_allowed_update_time = next_allowed_update_time;

            crank.push(
                buf,
                CrankRow {
                    pubkey: aggregator_key,
                    // Includes jitter
                    next_timestamp: next_allowed_update_time,
                },
            )?;

            msg!("Aggregator round still not completed within minute of round open.");
            return Ok(());
        }

        // SETUP OPEN ROUND
        let mut accounts = Box::new(AggregatorOpenRound {
            aggregator: Self::clone_loader(&aggregator)?,
            lease: Self::clone_loader(&lease)?,
            oracle_queue: Self::clone_loader(&ctx.accounts.oracle_queue)?,
            escrow: *escrow,
            program_state: Self::clone_loader(&ctx.accounts.program_state)?,
            payout_wallet: ctx.accounts.payout_wallet.clone(),
            token_program: ctx.accounts.token_program.clone(),
            permission,
            queue_authority: ctx.accounts.queue_authority.to_account_info(),
            data_buffer: ctx.accounts.queue_data_buffer.clone(),
            mint: ctx.accounts.mint.clone(),
        });
        let ctx = Context::new(ctx.program_id, accounts.as_mut(), &[], BTreeMap::new());
        let params = AggregatorOpenRoundParams {
            state_bump: params.state_bump,
            lease_bump: params.lease_bumps[idx],
            permission_bump: params.permission_bumps[idx],
            jitter: crank.jitter_modifier,
        };
        crank.jitter_modifier = crank.jitter_modifier.wrapping_add(1);
        let open_round_err = switchboard_v2::aggregator_open_round(ctx, params).err();
        let open_round_anchor_err_code: Option<u32> = {
            let mut res = None;
            if open_round_err.is_some() {
                let anchor_err = cast!(open_round_err.as_ref().unwrap(), Error::AnchorError);
                if anchor_err.is_some() {
                    res = Some(anchor_err.unwrap().error_code_number);
                }
            }
            res
        };
        let mut next_timestamp = aggregator.load()?.next_allowed_update_time;
        // Skip repushing feed if the lease is out.
        if is_fatal_err(&open_round_err) {
            // TODO(mgild): only want to do this on permission denied or insufficient funds and
            // should be done in open round maybe?
            // aggregator.load_mut()?.is_active = false;
            // Pop feed off crank without re-pushing. Do not error here so we can
            // persist removal of the dead lease/feed.
            lease.load_mut()?.crank_row_count = 0;
            emit!(CrankPopExpectedFailureEvent {
                feed_pubkey: aggregator_key,
                lease_pubkey: lease.key()
            });
            emit!(AggregatorCrankEvictionEvent {
                crank_pubkey: crank_key,
                aggregator_pubkey: aggregator_key,
                reason: open_round_anchor_err_code,
                timestamp: Clock::get()?.unix_timestamp,
            });
            return Ok(());
        } else if !is_error_reschedulable(&open_round_err) {
            // For ANY other error in open_round, make the transaction fail.
            return Err(open_round_err.unwrap());
        }
        if open_round_err.is_some() {
            msg!("Open round error occurred. {:?}", open_round_err);
            next_timestamp = Clock::get()?.unix_timestamp + 15;
        }
        // dont repush if theres not enough funds for next round. (this is checked in
        // validate)
        // REPUSH ON SUCCESS
        crank.push(
            buf,
            CrankRow {
                pubkey: aggregator_key,
                // Includes jitter
                next_timestamp,
            },
        )?;

        Ok(())
    }
}
