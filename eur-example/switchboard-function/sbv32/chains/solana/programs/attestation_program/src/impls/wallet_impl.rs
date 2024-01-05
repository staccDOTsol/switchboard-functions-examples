use crate::*;
use anchor_lang::{AccountDeserialize, Discriminator, Owner};
use anchor_spl::associated_token::Create;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use solana_program::borsh0_10::get_instance_packed_len;

#[derive(Clone, Default, Debug)]
pub struct SwitchboardWalletInit {
    pub bump: u8,

    pub mint: Pubkey,
    pub attestation_queue: Pubkey,
    pub authority: Pubkey,

    pub name: Vec<u8>,

    pub token_wallet: Pubkey,
    pub withdraw_authority: Option<Pubkey>,
}

pub struct WalletInitAccounts<'a> {
    pub wallet: AccountInfo<'a>,
    pub token_wallet: AccountInfo<'a>,

    pub mint: Account<'a, Mint>,
    pub attestation_queue: AccountInfo<'a>,
    pub authority: AccountInfo<'a>, // should we enforce a signer here?

    pub payer: Signer<'a>,

    pub system_program: Program<'a, System>,
    pub token_program: Program<'a, Token>,
    pub associated_token_program: Program<'a, AssociatedToken>,
}

// PDA derived from authority and name of the wallet (ex. "Default", "LiquidatorFunctions")
// We need to store the pair of authority with token_wallet so we can have the authority sign
// to approve adding this wallet to other resources. Token wallet has to be controlled by state.
#[account]
pub struct SwitchboardWallet {
    /// The bump used to derive the PDA.
    pub bump: u8,
    /// Flag dictating whether the wallet has been initialized already.
    pub initialized: u8,
    /// The public key of the mint used for this wallet.
    pub mint: Pubkey, // PDA
    /// The attestation queue pubkey.
    pub attestation_queue: Pubkey, // PDA
    /// The wallet authority that is permitted to make account changes.
    pub authority: Pubkey, // PDA
    /// The name of the wallet for easier identification.
    pub name: [u8; 32], // PDA. derive by wallet name
    /// The number of resources tied to this wallet.
    pub resource_count: u32, // we should set some maximum
    /// The pubkey of the account that is permitted to withdraw funds from the wallet.
    /// Setting this to the default pubkey will lock deposited funds.
    pub withdraw_authority: Pubkey,
    /// The associated token account pubkey.
    pub token_wallet: Pubkey,

    // TODO: deprecate, too much data to store
    pub resources: Vec<Pubkey>,
    // TODO: deprecate, too much data to store
    pub resources_max_len: u32,

    /// Reserved.
    pub _ebuf: [u8; 64],
}

impl SwitchboardWallet {
    pub fn size() -> usize {
        SwitchboardWallet::space(Some(1))
    }

    pub fn space(_len: Option<u32>) -> usize {
        // TODO: hard code this value, it wont change and will lower compute units
        let base: usize = 8  // discriminator
            + get_instance_packed_len(&SwitchboardWallet::default()).unwrap();
        let vec_elements: usize = 1;
        base + (vec_elements * 32)
    }

    /// Asserts that a resource can only be added if they share the same authority, or the current
    /// wallet authority signs the request. A resource is any consumer of the wallet funds.
    ///
    /// # Arguments
    ///
    /// * `new_resource_authority` - The account that will be the new resource's authority. If this
    /// *   is the same authority as the wallet then no signer is required.
    /// * `wallet_authority` - The optional signer of the wallet.
    ///
    /// # Errors
    ///
    /// * `MissingSbWalletAuthoritySigner` - If the new authority doesnt match the wallet authority and
    ///                                      the wallet authority did not sign the transaction
    pub fn assert_new_resource_authority(
        &self,
        new_resource_authority: &AccountInfo,
        wallet_authority: &Option<Signer>,
    ) -> anchor_lang::Result<()> {
        // If the same authority is used to create the resource, then
        // we know this resource is owned by the same authority, skip check.
        if self.authority == new_resource_authority.key() {
            return Ok(());
        }

        if let Some(wallet_authority) = wallet_authority.as_ref() {
            if self.authority == wallet_authority.key() && wallet_authority.is_signer {
                return Ok(());
            }
        }

        Err(error!(SwitchboardError::MissingSbWalletAuthoritySigner))
    }

    pub fn new(info: &AccountInfo) -> anchor_lang::Result<SwitchboardWallet> {
        if info.owner == &anchor_lang::system_program::ID && info.lamports() == 0 {
            return Err(ErrorCode::AccountNotInitialized.into());
        }
        if info.owner != &SwitchboardWallet::owner() {
            return Err(Error::from(ErrorCode::AccountOwnedByWrongProgram)
                .with_pubkeys((*info.owner, SwitchboardWallet::owner())));
        }

        let mut data: &[u8] = &info.try_borrow_data()?;
        if data.len() < 8 {
            return Err(ErrorCode::AccountNotInitialized.into());
        }
        data = &data[8..];
        SwitchboardWallet::try_deserialize_unchecked(&mut data)
    }

    pub fn init_if_needed(
        accounts: WalletInitAccounts,
        name: Vec<u8>,
    ) -> anchor_lang::Result<Box<Account<SwitchboardWallet>>> {
        let space = SwitchboardWallet::size();

        if accounts.wallet.owner == &anchor_lang::system_program::ID
            && accounts.wallet.lamports() == 0
        {
            msg!(
                "SwitchboardWallet not initialized {:?} ",
                accounts.wallet.key()
            );

            let (wallet_pubkey, bump) = Pubkey::find_program_address(
                &[
                    accounts.mint.key().to_bytes().as_ref(),
                    accounts.attestation_queue.key().to_bytes().as_ref(),
                    accounts.authority.key().to_bytes().as_ref(),
                    &name,
                ],
                &switchboard_attestation_program::ID,
            );

            if wallet_pubkey != accounts.wallet.key() {
                msg!(
                    "expected = {:?}, received = {:?}",
                    accounts.wallet.key(),
                    wallet_pubkey
                );
                return Err(error!(SwitchboardError::GenericError));
            }

            anchor_lang::system_program::create_account(
                CpiContext::new_with_signer(
                    accounts.system_program.to_account_info(),
                    anchor_lang::system_program::CreateAccount {
                        from: accounts.payer.to_account_info(),
                        to: accounts.wallet.to_account_info(),
                    },
                    &[&[
                        accounts.mint.key().to_bytes().as_ref(),
                        accounts.attestation_queue.key().to_bytes().as_ref(),
                        accounts.authority.key().to_bytes().as_ref(),
                        &name,
                        &[bump],
                    ]],
                ),
                Rent::get()?.minimum_balance(space),
                space as u64,
                &switchboard_attestation_program::ID,
            )?;

            {
                // Manually set the discriminator
                let mut wallet_account_data = accounts.wallet.try_borrow_mut_data()?;
                if wallet_account_data.len() < SwitchboardWallet::discriminator().len() {
                    return Err(ErrorCode::AccountDiscriminatorNotFound.into());
                }
                wallet_account_data[0..8].copy_from_slice(&SwitchboardWallet::discriminator());
            }

            // Initialize the SwitchboardWallet params
            let mut wallet = Box::new(Account::<SwitchboardWallet>::try_from_unchecked(
                &accounts.wallet,
            )?);

            wallet.initialize(&SwitchboardWalletInit {
                bump,
                name,
                mint: accounts.mint.key(),
                attestation_queue: accounts.attestation_queue.key(),
                authority: accounts.authority.key(),
                token_wallet: accounts.token_wallet.key(),
                withdraw_authority: None,
            })?;

            // Initialize the associated token account
            let token_wallet_pubkey = anchor_spl::associated_token::get_associated_token_address(
                &wallet_pubkey,
                &accounts.mint.key(),
            );
            if token_wallet_pubkey != accounts.token_wallet.key() {
                return Err(error!(SwitchboardError::GenericError));
            }

            anchor_spl::associated_token::create(CpiContext::new(
                accounts.associated_token_program.to_account_info(),
                Create {
                    payer: accounts.payer.to_account_info(),
                    associated_token: accounts.token_wallet.to_account_info(),
                    authority: accounts.wallet.to_account_info(),
                    mint: accounts.mint.to_account_info(),
                    system_program: accounts.system_program.to_account_info(),
                    token_program: accounts.token_program.to_account_info(),
                },
            ))?;

            // let token_wallet = Box::new(Account::<TokenAccount>::try_from_unchecked(
            //     &accounts.token_wallet,
            // )?);

            return Ok(wallet);
        }

        let mut wallet = Box::new(Account::<SwitchboardWallet>::try_from(&accounts.wallet)?);

        // let token_wallet = Box::new(Account::<TokenAccount>::try_from_unchecked(
        //     &accounts.token_wallet,
        // )?);

        if wallet.initialized == 0 {
            // re-verify the PDA using the accounts seeds
            let (wallet_pubkey, bump) = Pubkey::find_program_address(
                &[
                    accounts.mint.key().to_bytes().as_ref(),
                    accounts.attestation_queue.key().to_bytes().as_ref(),
                    wallet.authority.to_bytes().as_ref(), // override
                    &wallet.name,                         // override
                ],
                &switchboard_attestation_program::ID,
            );

            if wallet_pubkey != wallet.key() {
                return Err(error!(SwitchboardError::GenericError));
            }

            wallet.initialize(&SwitchboardWalletInit {
                bump,
                name,
                mint: accounts.mint.key(),
                attestation_queue: accounts.attestation_queue.key(),
                authority: accounts.authority.key(),
                token_wallet: accounts.token_wallet.key(),
                withdraw_authority: None,
            })?;

            return Ok(wallet);
        }

        Ok(wallet)
    }

    pub fn add_resource(&mut self) -> Result<()> {
        self.resource_count = self
            .resource_count
            .checked_add(1)
            .ok_or_else(|| error!(SwitchboardError::IllegalExecuteAttempt))?; // overflow

        Ok(())
    }

    pub fn remove_resource(&mut self) -> Result<()> {
        self.resource_count = self
            .resource_count
            .checked_sub(1)
            .ok_or_else(|| error!(SwitchboardError::IllegalExecuteAttempt))?; // underflow

        Ok(())
    }

    pub fn parse_name(name: &[u8]) -> [u8; 32] {
        let mut name = name.to_vec();
        name.resize(32, 0);
        name.try_into().unwrap()
    }

    pub fn derive_key(
        mint: Pubkey,
        attestation_queue: Pubkey,
        authority: Pubkey,
        name: Vec<u8>,
    ) -> Pubkey {
        let (pda_key, _bump) = Pubkey::find_program_address(
            &[
                mint.as_ref(),
                attestation_queue.as_ref(),
                authority.as_ref(),
                &SwitchboardWallet::parse_name(&name),
            ],
            &crate::id(),
        );
        pda_key
    }

    pub fn initialize(&mut self, params: &SwitchboardWalletInit) -> Result<()> {
        if self.initialized == 1 {
            // TODO: validate params
            return Err(error!(SwitchboardError::InvalidEscrow));
        }

        let wallet_key = SwitchboardWallet::derive_key(
            params.mint,
            params.attestation_queue,
            params.authority,
            params.name.clone(),
        );

        let ata_key = find_associated_token_address(&wallet_key, &params.mint);
        if ata_key != params.token_wallet {
            return Err(error!(SwitchboardError::InvalidEscrow));
        }

        self.initialized = 1;
        self.bump = params.bump;
        self.mint = params.mint;
        self.attestation_queue = params.attestation_queue;
        self.authority = params.authority;
        self.name = SwitchboardWallet::parse_name(&params.name);
        self.withdraw_authority = params.withdraw_authority.unwrap_or(params.authority);
        self.token_wallet = params.token_wallet;

        self.resources_max_len = u32::MAX;

        Ok(())
    }

    pub fn transfer<'a>(
        wallet: &Account<'a, SwitchboardWallet>,
        token_wallet: &Account<'a, TokenAccount>,
        receiver: &Account<'a, TokenAccount>,
        token_program: &AccountInfo<'a>,
        amount: u64,
    ) -> anchor_lang::Result<()> {
        if amount == 0 {
            return Ok(());
        }

        if token_wallet.key() == receiver.key() {
            return Ok(());
        }

        if wallet.token_wallet != token_wallet.key() {
            return Err(error!(SwitchboardError::InvalidEscrow));
        }

        transfer(
            token_program,
            token_wallet,
            receiver,
            &wallet.to_account_info(),
            &[&[
                wallet.mint.to_bytes().as_ref(),
                wallet.attestation_queue.to_bytes().as_ref(),
                wallet.authority.to_bytes().as_ref(),
                &wallet.name,
                &[wallet.bump],
            ]],
            amount,
        )?;

        Ok(())
    }
}

impl Default for SwitchboardWallet {
    fn default() -> Self {
        Self {
            bump: 0,
            initialized: 0,
            mint: Pubkey::default(),
            attestation_queue: Pubkey::default(),
            authority: Pubkey::default(),
            name: [0u8; 32],
            resource_count: 0,
            withdraw_authority: Pubkey::default(),
            token_wallet: Pubkey::default(),
            resources: Vec::new(),
            resources_max_len: 0,
            _ebuf: [0u8; 64],
        }
    }
}
