use crate::*;
use anchor_spl::token::spl_token::state::AccountState;
use anchor_spl::token::Mint;
use anchor_spl::token::{freeze_account, thaw_account, FreezeAccount, ThawAccount};
use solana_program::program_option::COption;

pub fn get_associated_token_address(key: &Pubkey, mint: &Pubkey) -> Result<Pubkey> {
    Ok(Pubkey::find_program_address(
        &[key.as_ref(), anchor_spl::token::ID.as_ref(), mint.as_ref()],
        &ATOKEN_PID,
    )
    .0)
}

impl<'a> LeaseAccountData {
    pub fn size() -> usize {
        std::mem::size_of::<LeaseAccountData>() + 8
    }

    pub fn key_from_seed(
        program_id: &'a Pubkey,
        queue: &'a Pubkey,
        aggregator: &'a Pubkey,
        mut bump: Option<u8>,
    ) -> Result<(Pubkey, Vec<Vec<u8>>, u8)> {
        let mut lease_seeds: Vec<Vec<u8>> = vec![
            LEASE_SEED.to_vec(),
            queue.as_ref().to_vec(),
            aggregator.as_ref().to_vec(),
        ];
        if bump.is_none() {
            let (_lease_pubkey, lease_bump) =
                Pubkey::find_program_address(&to_seed_refs(&lease_seeds), program_id);
            bump = Some(lease_bump);
        }
        lease_seeds.push(vec![bump.unwrap()]);
        let lease_pubkey = Pubkey::create_program_address(&to_seed_refs(&lease_seeds), program_id)
            .map_err(|_| SwitchboardError::PdaDeriveError)?;
        Ok((lease_pubkey, lease_seeds, bump.unwrap()))
    }

    pub fn maybe_freeze_escrow(
        self,
        token_program: &AccountInfo<'a>,
        escrow: &Account<'a, TokenAccount>,
        mint: &Account<'a, Mint>,
        authority: &AccountInfo<'a>,
        state_bump: u8,
    ) -> Result<()> {
        require!(
            self.escrow == escrow.key(),
            SwitchboardError::InvalidTokenAccountKeyError
        );
        if escrow.state == AccountState::Frozen {
            return Ok(());
        }
        if mint.freeze_authority != COption::Some(authority.key()) {
            return Ok(());
        }
        let state_seeds: &[&[&[u8]]] = &[&[STATE_SEED, &[state_bump]]];
        freeze_account(CpiContext::new_with_signer(
            token_program.clone(),
            FreezeAccount {
                account: escrow.to_account_info().clone(),
                mint: mint.to_account_info().clone(),
                authority: authority.clone(),
            },
            state_seeds,
        ))
    }

    pub fn maybe_thaw_escrow(
        self,
        token_program: &AccountInfo<'a>,
        escrow: &Account<'a, TokenAccount>,
        mint: &Account<'a, Mint>,
        authority: &AccountInfo<'a>,
        state_bump: u8,
    ) -> Result<()> {
        require!(
            self.escrow == escrow.key(),
            SwitchboardError::InvalidTokenAccountKeyError
        );
        if escrow.state != AccountState::Frozen {
            return Ok(());
        }
        if mint.freeze_authority != COption::Some(authority.key()) {
            return Ok(());
        }
        let state_seeds: &[&[&[u8]]] = &[&[STATE_SEED, &[state_bump]]];
        thaw_account(CpiContext::new_with_signer(
            token_program.clone(),
            ThawAccount {
                account: escrow.to_account_info().clone(),
                mint: mint.to_account_info().clone(),
                authority: authority.clone(),
            },
            state_seeds,
        ))
    }

    pub fn get_remaining_accounts(
        remaining_accounts: &[AccountInfo<'a>],
        jobs_len: usize,
    ) -> (
        Vec<Account<'a, JobAccountData>>,
        Vec<Option<Account<'a, TokenAccount>>>,
    ) {
        let job_accounts: Vec<Account<JobAccountData>> = remaining_accounts[..jobs_len]
            .iter()
            .map(|x| Account::<JobAccountData>::try_from(x).unwrap())
            .collect();
        let maybe_token_accounts: Vec<Option<Account<TokenAccount>>> = remaining_accounts
            [jobs_len..jobs_len * 2]
            .iter()
            .map(|x| Account::<TokenAccount>::try_from(x).ok())
            .collect();
        (job_accounts, maybe_token_accounts)
    }

    pub fn validate_remaining_accounts(
        aggregator: &AggregatorAccountData,
        queue: &OracleQueueAccountData,
        remaining_accounts: &[AccountInfo],
        jobs_len: usize,
    ) -> Result<()> {
        let job_accounts = Self::get_remaining_accounts(remaining_accounts, jobs_len).0;
        for (idx, job_account) in job_accounts.iter().enumerate() {
            require!(
                job_account.key() == aggregator.job_pubkeys_data[idx],
                SwitchboardError::InvalidJobAccountError
            );
            let token_account_info = &remaining_accounts[jobs_len + idx];
            let ta_key = get_associated_token_address(&job_account.authority, &queue.get_mint())?;
            require!(
                token_account_info.key() == ta_key,
                SwitchboardError::InvalidTokenAccountKeyError
            );
        }
        Ok(())
    }
}
impl Default for LeaseAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
