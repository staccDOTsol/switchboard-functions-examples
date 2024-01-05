use crate::*;

#[account(zero_copy(unsafe))]
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
    pub is_on_queue: u8,
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

impl VerifierAccountData {
    pub fn size() -> usize {
        8 + std::mem::size_of::<VerifierAccountData>()
    }

    pub fn signer(&self) -> Pubkey {
        self.enclave.enclave_signer
    }

    pub fn assert_signer(&self, signer: &AccountInfo) -> Result<()> {
        if self.enclave.enclave_signer != signer.key() {
            return Err(error!(SwitchboardError::InvalidEnclaveSigner));
        }

        Ok(())
    }

    pub fn is_verified(&self, clock: &Clock) -> bool {
        match self.enclave.verification_status.into() {
            VerificationStatus::VerificationOverride => true,
            VerificationStatus::VerificationSuccess => {
                self.enclave.valid_until > clock.unix_timestamp
            }
            _ => false,
        }
    }

    pub fn verify(&self, clock: &Clock) -> Result<()> {
        if !self.is_verified(clock) {
            return Err(error!(SwitchboardError::InvalidQuote));
        }

        Ok(())
    }
}
