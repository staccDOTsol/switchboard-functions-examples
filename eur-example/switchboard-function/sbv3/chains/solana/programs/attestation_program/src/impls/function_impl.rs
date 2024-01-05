use crate::*;

#[account(zero_copy(unsafe))]
#[repr(packed)]
pub struct FunctionAccountData {
    // Easy Filtering Config
    /// Whether the function is invoked on a schedule or by request
    // TODO: deprecate
    pub is_scheduled: u8,
    /// Whether the function has been manually triggered with the function_trigger instruction
    // TODO: deprecate
    pub is_triggered: u8,

    /// The function permissions granted by the attestation_queue.authority
    pub permissions: u32,
    pub status: FunctionStatus,

    // 15

    // Metadata
    /// PDA bump.
    pub bump: u8,
    /// The payer who originally created the function. Cannot change, used to derive PDA.
    pub creator_seed: [u8; 32],
    /// The name of the function for easier identification.
    pub name: [u8; 64],
    /// The metadata of the function for easier identification.
    pub metadata: [u8; 256],
    /// The Solana slot when the function was created. (PDA)
    pub created_at_slot: u64,
    /// The unix timestamp when the function was created.
    pub created_at: i64,
    /// The unix timestamp when the function config (container, registry, version, or schedule) was changed.
    pub updated_at: i64,

    // 392

    // Attestation Config
    /// The enclave quote
    // TODO: deprecate
    pub enclave: Quote,
    /// An array of permitted mr_enclave measurements for the function.
    pub mr_enclaves: [[u8; 32]; 32],

    // 1849

    // Container Settings
    /// The off-chain registry to fetch the function container from.
    pub container_registry: [u8; 64], 
    /// The identifier of the container in the given container_registry.
    pub container: [u8; 64],
    /// The version tag of the container to pull.
    pub version: [u8; 32],
    /// The expected schema for the container params.
    // TODO: deprecate
    pub params_schema: [u8; 256],
    /// The default params passed to the container during scheduled execution.
    // TODO: deprecate
    pub default_container_params: [u8; 256],

    // 2521

    // Accounts Config
    /// The authority of the function which is authorized to make account changes.
    pub authority: Pubkey,
    /// The address of the AttestationQueueAccountData that will be processing function requests and verifying the function measurements.
    pub attestation_queue: Pubkey,
    /// An incrementer used to rotate through an AttestationQueue's verifiers.
    pub queue_idx: u32,
    /// The address_lookup_table of the function used to increase the number of accounts we can fit into a function result.
    pub address_lookup_table: Pubkey,

    // 2621

    // Schedule Config
    /// The cron schedule to run the function on.
    // TODO: deprecate
    pub schedule: [u8; 64],
    /// The unix timestamp when the function was last run.
    // TODO: deprecate
    pub last_execution_timestamp: i64,
    /// The unix timestamp when the function is allowed to run next.
    // TODO: deprecate
    pub next_allowed_timestamp: i64,
    /// The number of times to trigger the function upon the next invocation.
    // TODO: deprecate
    pub trigger_count: u64,
    /// Time this function has been sitting in an explicitly triggered state
    // TODO: deprecate
    pub triggered_since: i64,

    // Permission Settings
    /// UNUSED. The unix timestamp when the current permissions expire.
    pub permission_expiration: i64,

    // Requests Config
    /// Number of requests created for this function. Used to prevent closing when there are live requests.
    pub num_requests: u64,
    /// Whether custom requests have been disabled for this function.
    pub requests_disabled: u8,
    /// Whether new requests need to be authorized by the FunctionAccount authority before being initialized.
    /// Useful if you want to use CPIs to control request account creation.
    pub requests_require_authorization: u8,
    /// DEPRECATED.
    pub reserved1: [u8; 8],
    /// The dev fee that is paid out from the request's escrow to the function's escrow on each successful invocation.
    /// This is used to reward the function maintainer for providing the function.
    /// 0 = No Fee. Sender = requests's escrow_token_wallet. Receiver = function's reward_token_wallet.
    pub requests_dev_fee: u64,

    // Token Config
    /// The SwitchboardWallet that will handle pre-funding rewards paid out to function verifiers.
    pub escrow_wallet: Pubkey,
    /// The escrow_wallet TokenAccount that handles pre-funding rewards paid out to function runners.
    pub escrow_token_wallet: Pubkey,
    /// The SwitchboardWallet that will handle acruing rewards from requests.
    /// Defaults to the escrow_wallet.
    pub reward_escrow_wallet: Pubkey,
    /// The reward_escrow_wallet TokenAccount used to acrue rewards from requests made with custom parameters.
    pub reward_escrow_token_wallet: Pubkey,

    /// The last reported error code if the most recent response was a failure
    // TODO: deprecate
    pub error_status: u8,

    // Routines Config
    /// Number of routines created for this function. Used to prevent closing when there are live routines.
    pub num_routines: u64,
    /// Whether custom routines have been disabled for this function.
    pub routines_disabled: BoolWithLock,
    /// Whether new routines need to be authorized by the FunctionAccount authority before being initialized.
    /// Useful if you want to provide AccessControl and only allow certain parties to run routines.
    pub routines_require_authorization: u8,
    /// The fee that is paid out from the routine's escrow to the function's escrow on each successful invocation.
    /// This is used to reward the function maintainer for providing the function.
    /// 0 = No Fee. Sender = routine's escrow_token_wallet. Receiver = function's reward_token_wallet.
    pub routines_dev_fee: u64,

    /// The functions MRENCLAVE measurement dictating the contents of the secure enclave.
    // This represents the last successful execution of a function.
    pub mr_enclave: [u8; 32],
    /// The VerificationStatus of the quote.
    pub verification_status: u8,
    /// The unix timestamp when the quote was last verified.
    pub verification_timestamp: i64,
    /// The unix timestamp when the quotes verification status expires.
    pub valid_until: i64,

    /// Reserved.
    pub _ebuf: [u8; 956],
}

impl FunctionAccountData {
    /// Returns the size of the function account data in bytes. Includes the discriminator.
    pub fn size() -> usize {
        8 + std::mem::size_of::<FunctionAccountData>()
    }

    /// Increments the queue index and wraps around if it exceeds the queue's data length.
    /// Used to provide round-robin oracle assignment.
    ///
    /// # Arguments
    ///
    /// * `queue_data_len` - The length of the queue's data.
    ///
    /// # Returns
    ///
    /// The previous queue index before incrementing.
    pub fn increment_queue_idx(&mut self, queue_data_len: u32) -> u32 {
        let curr_queue_idx = self.queue_idx;
        self.queue_idx += 1;
        self.queue_idx %= queue_data_len;
        curr_queue_idx
    }

    /// Adds a new routine to the function. Used to prevent closing when routines are active.
    pub fn add_routine(&mut self) -> Result<()> {
        self.num_routines = self
            .num_routines
            .checked_add(1)
            .ok_or(error!(SwitchboardError::IllegalExecuteAttempt))?;

        Ok(())
    }

    // Removes a routine from the function. Used to prevent closing when routines are active.
    pub fn remove_routine(&mut self) -> Result<()> {
        self.num_routines = self
            .num_routines
            .checked_sub(1)
            .ok_or(error!(SwitchboardError::IllegalExecuteAttempt))?;

        Ok(())
    }

    /// Adds a new request to the function. Used to prevent closing when requests are active.
    pub fn add_request(&mut self) -> Result<()> {
        self.num_requests = self
            .num_requests
            .checked_add(1)
            .ok_or(error!(SwitchboardError::IllegalExecuteAttempt))?;

        Ok(())
    }

    /// Removes a request from the function. Used to prevent closing when requests are active.
    pub fn remove_request(&mut self) -> Result<()> {
        self.num_requests = self
            .num_requests
            .checked_sub(1)
            .ok_or(error!(SwitchboardError::IllegalExecuteAttempt))?;

        Ok(())
    }

    pub fn set_name(&mut self, _name: &[u8]) -> Result<()> {
        if _name.len() > 64 {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        let mut name = _name.to_vec();
        name.resize(64, 0);
        self.name = name.try_into().unwrap();

        Ok(())
    }

    pub fn set_metadata(&mut self, _metadata: &[u8]) -> Result<()> {
        if _metadata.len() > 256 {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        let mut metadata = _metadata.to_vec();
        metadata.resize(256, 0);
        self.metadata = metadata.try_into().unwrap();

        Ok(())
    }

    pub fn set_container(&mut self, _container: &[u8]) -> Result<()> {
        if _container.len() > 64 {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        let mut container = _container.to_vec();
        container.resize(64, 0);
        self.container = container.try_into().unwrap();

        Ok(())
    }

    pub fn set_container_registry(&mut self, _container_registry: &[u8]) -> Result<()> {
        if _container_registry.len() > 64 {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        let mut container_registry = _container_registry.to_vec();
        container_registry.resize(64, 0);
        self.container_registry = container_registry.try_into().unwrap();

        Ok(())
    }

    pub fn set_version(&mut self, _version: &[u8]) -> Result<()> {
        if _version.len() > 32 {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        let mut version = _version.to_vec();
        version.resize(32, 0);
        self.version = version.try_into().unwrap();

        Ok(())
    }

    // TODO: deprecate
    pub fn set_schedule(&mut self, _schedule: &[u8]) -> Result<()> {
        if _schedule.len() > 64 {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        let mut schedule = _schedule.to_vec();
        schedule.resize(64, 0);
        self.schedule = schedule.try_into().unwrap();

        if self.is_empty_schedule() {
            self.is_scheduled = 0;
        } else {
            self.is_scheduled = 1;
        }

        Ok(())
    }

    // TODO: deprecate
    pub fn is_empty_schedule(&self) -> bool {
        self.schedule
            .first()
            .map(|&byte| byte == 0)
            .unwrap_or(false)
    }

    /// Sets the whitelisted mr_enclaves for the function account.
    ///
    /// # Arguments
    ///
    /// * `mr_enclaves` - An array of 32-byte measurement roots of the enclaves.
    ///
    /// # Errors
    ///
    /// Returns an error if the length of `mr_enclaves` is greater than 32.
    ///
    /// # Example
    ///
    /// ```
    /// let mut function = FunctionAccountData::default();
    /// let mr_enclaves = [[0; 32]; 32];
    /// function.set_mr_enclaves(&mr_enclaves).unwrap();
    /// ```
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

    /// Asserts that the permissions are valid for the given queue's access control level.
    ///
    /// # Arguments
    ///
    /// * `queue_require_usage_permissions` - A boolean indicating whether queue usage permissions are required.
    ///
    /// # Errors
    ///
    /// Returns an error if the queue usage permissions are required but not present.
    pub fn assert_permissions(&self, queue_require_usage_permissions: bool) -> Result<()> {
        if queue_require_usage_permissions
            && self.permissions != SwitchboardAttestationPermission::PermitQueueUsage as u32
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }

        Ok(())
    }

    /// Asserts that a given mr_enclave is not [0u8; 32] and is present in the functions
    /// enclave set.
    ///
    /// # Errors
    ///
    /// * `InvalidMrEnclave` - if the mr_enclave is [0u8; 32]
    /// * `IncorrectMrEnclave` - if the mr_enclave is not present in the functions config
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the `mr_enclave` is valid and matches the expected value.
    pub fn assert_mr_enclave(&self, mr_enclave: &[u8; 32]) -> Result<()> {
        if *mr_enclave == [0u8; 32] {
            return Err(error!(SwitchboardError::InvalidMrEnclave));
        }

        if !self.is_valid_enclave(mr_enclave) {
            return Err(error!(SwitchboardError::IncorrectMrEnclave));
        }

        Ok(())
    }

    /// Checks if the given `mr_enclave` is valid by verifying if it exists in the list of valid
    /// `mr_enclaves` stored in the current instance of `FunctionImpl`.
    ///
    /// # Arguments
    ///
    /// * `mr_enclave` - A reference to a 32-byte array representing the `mr_enclave` value of the
    ///                  enclave to be validated.
    ///
    /// # Returns
    ///
    /// A boolean value indicating whether the given `mr_enclave` is valid or not.
    pub fn is_valid_enclave(&self, mr_enclave: &[u8; 32]) -> bool {
        if *mr_enclave == [0u8; 32] {
            return false;
        }

        self.mr_enclaves.contains(mr_enclave)
    }

    /// Parses the enclave measurements and returns a vector of 32-byte arrays representing the non-empty mr_enclaves.
    ///
    /// # Example
    ///
    /// ```
    /// use crate::FunctionAccountData;
    ///
    /// let function = FunctionAccountData::default();
    /// let parsed_enclaves = function.parse_enclaves();
    /// assert_eq(0, parsed_enclaves.len());
    /// ```
    pub fn parse_enclaves(&self) -> Vec<[u8; 32]> {
        let mut parsed_enclaves: Vec<[u8; 32]> = vec![];
        for mr_enclave in self.mr_enclaves.iter() {
            if *mr_enclave != [0u8; 32] {
                parsed_enclaves.push(*mr_enclave)
            }
        }
        parsed_enclaves
    }

    /// Asserts that the current instance has enclaves.
    ///
    /// # Errors
    ///
    /// Returns an error of type `SwitchboardError::MrEnclavesEmpty` if the enclaves are empty.
    pub fn assert_has_enclaves(&self) -> Result<()> {
        if self.parse_enclaves().is_empty() {
            return Err(error!(SwitchboardError::MrEnclavesEmpty));
        }

        Ok(())
    }

    /// Asserts that requests are enabled for the given function.
    ///
    /// # Errors
    ///
    /// Returns an error of type `SwitchboardError::UserRequestsDisabled` if the function has requests_disabled configured.
    fn assert_requests_enabled(&self) -> Result<()> {
        if self.requests_disabled.to_bool() {
            return Err(error!(SwitchboardError::UserRequestsDisabled));
        }

        Ok(())
    }

    /// Asserts that routines are enabled for the given function.
    ///
    /// # Errors
    ///
    /// Returns an error of type `SwitchboardError::FunctionRoutinesDisabled` if the function has routines_disabled configured.
    fn assert_routines_enabled(&self) -> Result<()> {
        if self.routines_disabled.is_disabled() {
            return Err(error!(SwitchboardError::FunctionRoutinesDisabled));
        }

        Ok(())
    }

    /// Checks if the function is ready to execute routines.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    ///
    /// - Routines are disabled.
    /// - The function has 0 valid mr_enclaves.
    /// - The function status is not `Active`.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the function is ready to execute routines.
    pub fn ready_for_routines(&self) -> Result<()> {
        self.assert_routines_enabled()?;
        self.assert_has_enclaves()?;

        if self.status != FunctionStatus::Active {
            return Err(error!(SwitchboardError::FunctionNotReady));
        }

        Ok(())
    }

    /// Checks if the function is ready to execute requests.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    ///
    /// - Requests are disabled.
    /// - The function has 0 valid mr_enclaves.
    /// - The function status is not `Active`.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the function is ready to execute requests.
    pub fn ready_for_requests(&self) -> Result<()> {
        self.assert_requests_enabled()?;
        self.assert_has_enclaves()?;

        if self.status != FunctionStatus::Active && self.status != FunctionStatus::OutOfFunds {
            return Err(error!(SwitchboardError::FunctionNotReady));
        }

        Ok(())
    }

    /// Returns the public key of the reward token wallet. If the reward escrow token wallet is set,
    /// it returns the reward escrow token wallet. Otherwise, it returns the escrow token wallet.
    pub fn get_reward_token_wallet(&self) -> Pubkey {
        if self.reward_escrow_token_wallet != Pubkey::default() {
            self.reward_escrow_token_wallet
        } else {
            self.escrow_token_wallet
        }
    }

    /// Asserts that the given authority matches the expected authority for this function.
    /// If the authority is missing and the function requires authorization, returns an error.
    pub fn assert_optional_authority(&self, authority: &Option<AccountInfo>) -> Result<()> {
        if let Some(authority) = authority {
            if self.authority != authority.key() {
                return Err(error!(SwitchboardError::InvalidAuthority));
            }
        } else if self.requests_require_authorization.to_bool() {
            return Err(error!(SwitchboardError::MissingFunctionAuthority));
        }

        Ok(())
    }

    /// Asserts that the given authority matches the expected authority for this function.
    /// If the routine requires authorization and no authority is provided, returns an error.
    pub fn assert_optional_routine_authority(&self, authority: &Option<AccountInfo>) -> Result<()> {
        if let Some(authority) = authority {
            if self.authority != authority.key() {
                return Err(error!(SwitchboardError::InvalidAuthority));
            }
        } else if self.routines_require_authorization.to_bool() {
            return Err(error!(SwitchboardError::MissingFunctionAuthority));
        }

        Ok(())
    }

    /// Saves the attestation round results to the state.
    ///
    /// # Arguments
    ///
    /// * `clock` - The current clock instance.
    /// * `error_code` - The error code for the attestation round.
    /// * `verifier` - The public key of the verifier.
    /// * `enclave_signer` - The public key of the enclave signer.
    /// * `next_allowed_timestamp` - The next allowed timestamp for the attestation round.
    /// * `queue_data_len` - The number of oracles heartbeating on the attestation queue.
    pub fn save_round(
        &mut self,
        clock: &Clock,
        error_code: u8,
        enclave_signer: &Pubkey,
        next_allowed_timestamp: i64,
        queue_data_len: u32,
        mr_enclave: &[u8; 32],
    ) -> Result<()> {
        self.last_execution_timestamp = clock.unix_timestamp;

        // We should always set this to prevent repeated save_results
        self.next_allowed_timestamp = next_allowed_timestamp;

        // self.enclave.verifier = *verifier;

        // Increment the queue idx for round robin assignment
        self.increment_queue_idx(queue_data_len);

        // Errors
        // 0            : No error
        // 1 - 199      : User defined errors, still successful
        // 200 - 255    : Switchboard errors, verification failed
        self.error_status = error_code;
        if self.error_status < 200 {
            // No error, success
            self.enclave.enclave_signer = *enclave_signer;
            self.enclave.verification_status = VerificationStatus::VerificationSuccess as u8;
            self.enclave.verification_timestamp = clock.unix_timestamp;
            self.enclave.valid_until = clock.unix_timestamp + 604_800;
            self.enclave.mr_enclave = *mr_enclave;
            self.mr_enclave = *mr_enclave;
        } else {
            // Failure
            self.enclave.enclave_signer = Pubkey::default();
            self.enclave.verification_status = VerificationStatus::VerificationFailure as u8;
            self.enclave.verification_timestamp = 0;
            self.enclave.valid_until = 0;
            self.enclave.mr_enclave = [0; 32];
        }

        self.trigger_count = self.trigger_count.saturating_sub(1);
        if self.trigger_count == 0 {
            self.is_triggered = 0;
            self.triggered_since = 0;
        }

        Ok(())
    }

    /// Verifies whether a function is ready for verification.
    ///
    /// # Errors
    ///
    /// * `FunctionNotReady` - If the function status is not Active
    /// * `InvalidMrEnclave` - If the measured mr_enclave value is not null
    /// * `MrEnclavesEmpty` - If the function has 0 mr_enclaves whitelisted
    /// * `IncorrectMrEnclave` - If the measured mr_enclave is not found in the functions enclave set
    ///
    pub fn ready_for_function_verify(&self, mr_enclave: &[u8; 32]) -> Result<()> {
        // Verify the function status is Active
        if self.status != FunctionStatus::Active {
            return Err(error!(SwitchboardError::FunctionNotReady));
        }

        // Verify the mr_enclave is not empty
        if mr_enclave == &[0u8; 32] {
            return Err(error!(SwitchboardError::InvalidMrEnclave));
        }

        // Verify the function has any valid mr_enclave
        let enclave_set = self.parse_enclaves();
        if enclave_set.is_empty() {
            return Err(error!(SwitchboardError::MrEnclavesEmpty));
        }

        // Verify the function has added this mr_enclave to its enclave set
        if !enclave_set.contains(mr_enclave) {
            return Err(error!(SwitchboardError::IncorrectMrEnclave));
        }

        Ok(())
    }

    /// Verifies whether a function reqiest is ready for verification.
    ///
    /// # Errors
    ///
    /// * `RequestRoundNotActive` - If there is no active round for the request
    /// * `FunctionRequestNotReady` - If the request is not active yet
    /// * `UserRequestsDisabled` - If the function has disabled routines
    /// * `FunctionNotReady` - If the function status is not Active
    /// * `InvalidMrEnclave` - If the measured mr_enclave value is not null
    /// * `MrEnclavesEmpty` - If the function has 0 mr_enclaves whitelisted
    /// * `IncorrectMrEnclave` - If the measured mr_enclave is not found in the functions enclave set
    ///
    pub fn ready_for_request_verify(
        &self,
        request: &Account<FunctionRequestAccountData>,
        mr_enclave: &[u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;

        // Verify the request has an active round to verify
        if !request.is_round_active(&clock) {
            return Err(error!(SwitchboardError::RequestRoundNotActive));
        }

        // Verify whether the valid_after_slot has elapsed
        if request.active_request.valid_after_slot > 0
            && request.active_request.valid_after_slot > clock.slot
        {
            return Err(error!(SwitchboardError::FunctionRequestNotReady));
        }

        // !! requests_disabled is only enforced on resource creation !!
        // The fn authority can manually disable requests. We dont want to enforce this
        // after a request has been created and in-use.
        // if self.requests_disabled {
        //     return Err(error!(SwitchboardError::UserRequestsDisabled));
        // }

        self.ready_for_function_verify(mr_enclave)?;

        Ok(())
    }

    /// Verifies whether a function routine is ready for verification.
    ///
    /// # Errors
    ///
    /// * `RoutineDisabled` - If the routine has been disabled
    /// * `FunctionRoutinesDisabled` - If the function has disabled routines
    /// * `FunctionNotReady` - If the function status is not Active
    /// * `InvalidMrEnclave` - If the measured mr_enclave value is not null
    /// * `MrEnclavesEmpty` - If the function has 0 mr_enclaves whitelisted
    /// * `IncorrectMrEnclave` - If the measured mr_enclave is not found in the functions enclave set
    ///
    pub fn ready_for_routine_verify(
        &self,
        routine: &Account<FunctionRoutineAccountData>,
        mr_enclave: &[u8; 32],
    ) -> Result<()> {
        // Verify the routine is enabled
        if routine.is_disabled() {
            return Err(error!(SwitchboardError::RoutineDisabled));
        }

        // !! routines_disabled is only enforced on resource creation !!
        // The fn authority can manually disable routines. We dont want to enforce this
        // after a routine has been created and in-use.
        // if self.routines_disabled.is_disabled() {
        //     return Err(error!(SwitchboardError::FunctionRoutinesDisabled));
        // }

        self.ready_for_function_verify(mr_enclave)?;

        Ok(())
    }
}

// pub struct FunctionResourceVerifier<'a, T>
// where
//     T: AccountSerialize + AccountDeserialize + Clone,
// {
//     pub attestation_queue: AccountLoader<'a, AttestationQueueAccountData>,
//     pub function: AccountLoader<'a, FunctionAccountData>,
//     pub resource: Account<'a, T>,
// }

// pub trait FunctionResource {
//     fn verify(&self, func: &FunctionAccountData) -> Result<()>;
// }
