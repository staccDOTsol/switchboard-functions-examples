use crate::*;
use anchor_lang::Discriminator;
use arrayref::array_ref;
use std::cell::Ref;
use std::mem;

#[repr(u8)]
#[derive(Copy, Clone, Default, Debug, Eq, PartialEq, AnchorSerialize, AnchorDeserialize)]
pub enum VerificationStatus {
    #[default]
    None = 0,
    VerificationPending = 1 << 0,
    VerificationFailure = 1 << 1,
    VerificationSuccess = 1 << 2,
    VerificationOverride = 1 << 3,
}
impl From<VerificationStatus> for u8 {
    fn from(value: VerificationStatus) -> Self {
        match value {
            VerificationStatus::VerificationPending => 1 << 0,
            VerificationStatus::VerificationFailure => 1 << 1,
            VerificationStatus::VerificationSuccess => 1 << 2,
            VerificationStatus::VerificationOverride => 1 << 3,
            _ => 0,
        }
    }
}
impl From<u8> for VerificationStatus {
    fn from(value: u8) -> Self {
        match value {
            1 => VerificationStatus::VerificationPending,
            2 => VerificationStatus::VerificationFailure,
            4 => VerificationStatus::VerificationSuccess,
            8 => VerificationStatus::VerificationOverride,
            _ => VerificationStatus::default(),
        }
    }
}

#[zero_copy(unsafe)]
#[repr(packed)]
pub struct Quote {
    /// The address of the signer generated within an enclave.
    pub enclave_signer: Pubkey,
    /// The quotes MRENCLAVE measurement dictating the contents of the secure enclave.
    pub mr_enclave: [u8; 32],
    /// The VerificationStatus of the quote.
    pub verification_status: u8,
    /// The unix timestamp when the quote was last verified.
    pub verification_timestamp: i64,
    /// The unix timestamp when the quotes verification status expires.
    pub valid_until: i64,
    /// The off-chain registry where the verifiers quote can be located.
    pub quote_registry: [u8; 32],
    /// Key to lookup the buffer data on IPFS or an alternative decentralized storage solution.
    pub registry_key: [u8; 64],
    /// Reserved.
    pub _ebuf: [u8; 256],
}
impl Default for Quote {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}

#[zero_copy(unsafe)]
#[repr(packed)]
pub struct VerifierAccountData {
    /// Represents the state of the quote verifiers enclave.
    pub enclave: Quote,

    // Accounts Config
    /// The authority of the EnclaveAccount which is permitted to make account changes.
    pub authority: Pubkey,
    /// Queue used for attestation to verify a MRENCLAVE measurement.
    pub attestation_queue: Pubkey,

    // Metadata Config
    /// The unix timestamp when the quote was created.
    pub created_at: i64,

    // Queue Config
    /// Whether the quote is located on the AttestationQueues buffer.
    pub is_on_queue: bool,
    /// The last time the quote heartbeated on-chain.
    pub last_heartbeat: i64,

    // Token Config
    /// The SwitchboardWallet account containing the reward escrow for verifying quotes on-chain.
    /// We should set this whenever the operator changes so we dont need to pass another account and can verify with has_one.
    pub reward_escrow: Pubkey,
    /// The SwitchboardWallet account containing the queues required min_stake.
    /// Needs to be separate from the reward_escrow. Allows easier 3rd party management of stake from rewards.
    pub stake_wallet: Pubkey,

    /// Reserved.
    pub _ebuf: [u8; 1024],
}

unsafe impl Pod for VerifierAccountData {}
unsafe impl Zeroable for VerifierAccountData {}

impl Discriminator for VerifierAccountData {
    const DISCRIMINATOR: [u8; 8] = [106, 146, 60, 232, 231, 52, 189, 253];
}

impl Owner for VerifierAccountData {
    fn owner() -> Pubkey {
        SAS_PID
    }
}
impl ZeroCopy for VerifierAccountData {}

impl<'a> VerifierAccountData {
    pub fn validate_quote(
        account_info: &AccountInfo<'a>,
        _oracle_key: &Pubkey,
        clock: &Clock,
    ) -> Result<()> {
        // TODO: check quote queue?
        let data = account_info.try_borrow_data()?;
        let quote = Self::load(account_info.owner, data)?;
        if *account_info.owner != SAS_PID {
            return Err(error!(SwitchboardError::InvalidQuoteError));
        }
        if quote.enclave.verification_status != VerificationStatus::VerificationSuccess as u8 {
            return Err(error!(SwitchboardError::InvalidQuoteError));
        }
        if clock.unix_timestamp > quote.enclave.valid_until {
            return Err(error!(SwitchboardError::InvalidQuoteError));
        }
        Ok(())
    }

    pub fn load(
        owner: &Pubkey,
        data: Ref<'a, &'a mut [u8]>,
    ) -> Result<Ref<'a, VerifierAccountData>> {
        if *owner != SAS_PID {
            return Err(error!(SwitchboardError::InvalidQuoteError));
        }
        // let data = account_info.try_borrow_data()?;
        if data.len() < VerifierAccountData::discriminator().len() {
            return Err(ErrorCode::AccountDiscriminatorNotFound.into());
        }
        let disc_bytes = array_ref![data, 0, 8];
        if disc_bytes != &VerifierAccountData::discriminator() {
            return Err(ErrorCode::AccountDiscriminatorMismatch.into());
        }
        Ok(Ref::map(data, move |data| {
            bytemuck::from_bytes::<VerifierAccountData>(
                data[8..mem::size_of::<VerifierAccountData>() + 8].as_ref(),
            )
        }))
    }
}
