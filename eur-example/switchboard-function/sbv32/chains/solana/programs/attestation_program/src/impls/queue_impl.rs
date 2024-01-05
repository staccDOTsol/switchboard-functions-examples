use crate::*;

/// An AttestationQueue represents a round-robin queue of verifier oracles who attest on-chain
/// whether a Switchboard Function was executed within an enclave against an expected set of
/// enclave measurements.
///
/// For an oracle to join the queue, the oracle must first submit their enclave quote on-chain and
/// wait for an existing verifier to attest their quote. If the oracle's quote matches an expected
/// measurement within the queues mr_enclaves config, it is granted permissions and will start
/// being assigned update requests.
#[account(zero_copy(unsafe))]
#[repr(packed)]
pub struct AttestationQueueAccountData {
    /// The address of the authority which is permitted to add/remove allowed enclave measurements.
    pub authority: Pubkey,
    /// Allowed enclave measurements.
    pub mr_enclaves: [[u8; 32]; 32],
    /// The number of allowed enclave measurements.
    pub mr_enclaves_len: u32,
    /// The addresses of the quote verifiers who have a valid
    /// verification status and have heartbeated on-chain recently.
    pub data: [Pubkey; 128],
    /// The length of valid quote verifiers for the given attestation queue.
    pub data_len: u32,
    /// Allow authority to force add a node after X seconds with no heartbeat.
    pub allow_authority_override_after: i64,
    /// Even if a heartbeating machine quote verifies with proper measurement,
    /// require authority signoff.
    pub require_authority_heartbeat_permission: bool,
    /// Require FunctionAccounts to have PermitQueueUsage before they are executed.
    pub require_usage_permissions: bool,
    /// The maximum allowable time until a EnclaveAccount needs to be re-verified on-chain.
    pub max_quote_verification_age: i64,
    /// The reward paid to quote verifiers for attesting on-chain.
    pub reward: u32, //TODO
    /// The unix timestamp when the last quote verifier heartbeated on-chain.
    pub last_heartbeat: i64,
    pub node_timeout: i64, // TODO ??
    /// Incrementer used to track the current quote verifier permitted to run any available functions.
    pub curr_idx: u32,
    /// Incrementer used to garbage collect and remove stale quote verifiers.
    pub gc_idx: u32,

    /// The minimum number of lamports a quote verifier needs to lock-up in order to heartbeat and verify other quotes.
    pub verifier_min_stake: u64,
    /// The minimum number of lamports a function needs to lock-up in order to use a queues resources.
    pub function_min_stake: u64,

    /// Reserved.
    pub _ebuf: [u8; 1008],
}

impl AttestationQueueAccountData {
    pub fn size() -> usize {
        8 + std::mem::size_of::<AttestationQueueAccountData>()
    }

    /// Verifies whether an attestation queue and verifier oracle are ready to verify a function.
    ///
    /// # Errors
    ///
    /// * `InsufficientQueue` - If the attestation queue has no active verifier oracles
    /// * `InvalidQuote` - If the verifier oracle has an invalid or expired quote
    /// * `IncorrectMrEnclave` - If the verifiers mr_enclave is not found in the attestation queue's enclave set
    ///
    pub fn verifier_ready_for_verification(&self, verifier: &VerifierAccountData) -> Result<()> {
        let clock = Clock::get()?;

        if self.data_len == 0 {
            return Err(error!(SwitchboardError::InsufficientQueue));
        }

        // check quote expiration
        if !verifier.is_verified(&clock) {
            return Err(error!(SwitchboardError::InvalidQuote));
        }

        // override check
        if verifier.enclave.verification_status != VerificationStatus::VerificationOverride as u8 {
            self.assert_mr_enclave(&verifier.enclave.mr_enclave)?;
        }

        Ok(())
    }

    pub fn assert_mr_enclave(&self, mr_enclave: &[u8; 32]) -> Result<()> {
        if !self.is_valid_enclave(mr_enclave) {
            return Err(error!(SwitchboardError::IncorrectMrEnclave));
        }

        Ok(())
    }

    pub fn set_mr_enclaves(&mut self, mr_enclaves: &[[u8; 32]]) -> Result<()> {
        if mr_enclaves.len() > 32 {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        let mut parsed_mr_enclaves: [[u8; 32]; 32] = [[0; 32]; 32];

        for (i, enclave) in mr_enclaves.iter().enumerate() {
            parsed_mr_enclaves[i] = *enclave;
        }

        self.mr_enclaves = parsed_mr_enclaves;
        Ok(())
    }

    pub fn is_valid_enclave(&self, mr_enclave: &[u8; 32]) -> bool {
        if *mr_enclave == [0u8; 32] {
            return false;
        }

        self.mr_enclaves.contains(mr_enclave)
    }

    pub fn parse_enclaves(&self) -> Vec<[u8; 32]> {
        let mut parsed_enclaves: Vec<[u8; 32]> = vec![];
        for mr_enclave in self.mr_enclaves.iter() {
            if *mr_enclave != [0u8; 32] {
                parsed_enclaves.push(*mr_enclave)
            }
        }
        parsed_enclaves
    }

    pub fn next_n(&mut self, n: u32) -> Result<Vec<Pubkey>> {
        if self.data_len < n {
            return Err(error!(SwitchboardError::InsufficientQueue));
        }
        let n = n as usize;
        let mut v = Vec::with_capacity(n);
        while v.len() != n {
            v.push(self.data[self.curr_idx as usize]);
            self.curr_idx += 1;
            self.curr_idx %= self.data_len;
        }
        Ok(v)
    }

    pub fn has_mr_enclave(&self, mr_enclave: &[u8]) -> bool {
        self.mr_enclaves[..self.mr_enclaves_len as usize]
            .iter()
            .any(|x| x.to_vec() == mr_enclave.to_vec())
    }

    pub fn try_garbage_collection(
        &mut self,
        clock: &Clock,
        gc_node_loader: &AccountLoader<'_, VerifierAccountData>,
    ) -> Result<bool> {
        let gc_idx = self.gc_idx as usize;
        let mut gc_node = gc_node_loader.load_mut()?;
        let gc_node_pubkey = self.data[gc_idx];
        if gc_node_pubkey != gc_node_loader.key() {
            msg!("Garbage collection index swapped. Skipping GC check.");
            return Ok(false);
        }
        self.gc_idx += 1;
        self.gc_idx %= self.data_len;
        if clock
            .unix_timestamp
            .checked_sub(gc_node.last_heartbeat)
            .unwrap()
            > self.node_timeout
            || gc_node.enclave.valid_until < clock.unix_timestamp
        {
            gc_node.is_on_queue = false.to_u8();
            self.data_len -= 1;
            self.data.swap(gc_idx, self.data_len as usize);
            self.curr_idx %= self.data_len;
            self.gc_idx %= self.data_len;
            return Ok(true);
        }
        Ok(false)
    }

    pub fn assert_is_ready(&self) -> Result<()> {
        if self.data_len == 0 {
            return Err(error!(SwitchboardError::InsufficientQueue));
        }

        Ok(())
    }

    pub fn get_assigned_key(&self, queue_idx: u32) -> Result<Pubkey> {
        self.assert_is_ready()?;

        let assigned_key = self.data[(queue_idx % self.data_len) as usize];
        Ok(assigned_key)
    }
}
