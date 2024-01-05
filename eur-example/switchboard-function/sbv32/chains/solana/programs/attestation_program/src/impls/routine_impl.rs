use crate::*;

/// The function routine account provides scheduled execution of Switchboard Functions
/// with a configurable cron-based schedule and container parameters.
///
/// Function routines maintain their own queue_idx to provide round-robin assignment of
/// verifiers for each settled execution. This is incremented after each invocation.
///
/// Function routines can share a SwitchboardWallet as long as the escrow authority has
/// signed the transaction.
#[account]
pub struct FunctionRoutineAccountData {
    // Metadata (8)
    /// The name of the function routine for easier identification.
    pub name: [u8; 64],
    /// The metadata of the function routine for easier identification.
    pub metadata: [u8; 256],
    /// The unix timestamp when the function routine was created.
    pub created_at: i64,
    /// The unix timestamp when the function routine config was changed.
    pub updated_at: i64,

    // Disabled Config
    /// Flag to disable the function and prevent new verification requests.
    pub is_disabled: ResourceLevel,
    /// The type of resource that disabled the routine.
    // pub disabler: ResourceLevel,

    // Status
    pub status: RoutineStatus,
    /// The last reported error code if the most recent response was a failure
    pub error_status: u8,
    /// The enclave generated signer for this routine.
    pub enclave_signer: Pubkey,
    /// The verifier oracle who signed this verification.
    pub verifier: Pubkey,

    // Fees
    /// The SOL bounty in lamports used to incentivize a verifier to expedite the request. 0 = no bounty. Receiver = verifier oracle.
    pub bounty: u64,

    // Accounts
    /// Signer allowed to manage the routine.
    pub authority: Pubkey,
    /// The default destination for rent exemption when the account is closed.
    pub payer: Pubkey,
    /// The function that manages the mr_enclave set for this routine.
    pub function: Pubkey,
    /// The Attestation Queue for this request.
    pub attestation_queue: Pubkey,

    /// The tokenAccount escrow
    // The SwitchboardWallet that manages the escrow. A single SwitchboardWallet can support many routines.
    pub escrow_wallet: Pubkey,
    /// The TokenAccount with funds for the escrow.
    pub escrow_token_wallet: Pubkey,

    // Execution Config
    /// The index of the verifier on the queue that is assigned to process the next invocation.
    /// This is incremented after each invocation in a round-robin fashion.
    pub queue_idx: u32,
    /// The cron schedule to run the function on.
    pub schedule: [u8; 64],
    // Container Params
    /// The maximum number of bytes to pass to the container params.
    pub max_container_params_len: u32,
    /// Hash of the serialized container_params to prevent RPC tampering.
    /// Should be verified within your function to ensure you are using the correct parameters.
    pub container_params_hash: [u8; 32],
    /// The stringified container params to pass to the function.
    pub container_params: Vec<u8>,

    // Status / Tracking
    /// The unix timestamp when the function was last run.
    pub last_execution_timestamp: i64,
    /// The unix timestamp when the function was last run successfully.
    pub last_successful_execution_timestamp: i64,
    /// The unix timestamp when the function is allowed to run next.
    pub next_allowed_timestamp: i64,

    /// Reserved.
    // TODO: investigate why this causes stack frame issues when set to 1024 bytes
    pub _ebuf: [u8; 512],
}

impl FunctionRoutineAccountData {
    /// Returns the amount of memory space required for a FunctionRoutine account.
    ///
    /// # Arguments
    ///
    /// * `len` - An optional `u32` value representing the length of the container parameters vector.
    ///
    /// # Returns
    ///
    /// * `usize` - The total amount of memory space required for a FunctionRoutine account.
    pub fn space(len: Option<u32>) -> usize {
        // size of struct if vec is empty
        let base: usize = solana_program::borsh0_10::get_instance_packed_len(
            &FunctionRoutineAccountData::default(),
        )
        .unwrap();
        msg!("FunctionRoutine base usize: {:?}", base);
        // let base: usize = 1216;

        // the number of bytes needed for the container params
        let vec_elements: usize = len.unwrap_or(DEFAULT_MAX_CONTAINER_PARAMS_LEN) as usize;

        // total bytes
        8 + base + vec_elements
    }

    /// Asserts that the length of the account data matches the expected length.
    ///
    /// # Arguments
    ///
    /// * `account_info` - The account info to check the data length of.
    /// * `len` - The expected length of the account data.
    ///
    /// # Errors
    ///
    /// Returns an error if the length of the account data does not match the expected length.
    pub fn assert_data_len(account_info: &AccountInfo<'_>, len: Option<u32>) -> bool {
        let data_len = account_info.data_len();
        // msg!("data_len: {:?}", data_len);
        let expected_data_len = Self::space(len);
        // msg!("expected_data_len: {:?}", expected_data_len);

        data_len == expected_data_len

        // if data_len != expected_data_len {
        //     return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        // }

        // Ok(())
    }

    /// Sets the name of the routine.
    ///
    /// # Arguments
    ///
    /// * `name` - An optional vector of bytes representing the name of the routine.
    ///
    /// # Errors
    ///
    /// Returns an error if the length of the name is greater than 64 bytes.
    ///
    /// # Example
    ///
    /// ```
    /// # use crate::FunctionRoutineAccountData;
    /// let mut routine = FunctionRoutineAccountData::default();
    /// let name = Some(vec![72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
    /// routine.set_name(&name).unwrap();
    /// ```
    pub fn set_name(&mut self, name: &Option<Vec<u8>>) -> Result<()> {
        if let Some(name) = name {
            if name.len() > 64 {
                return Err(error!(SwitchboardError::IllegalExecuteAttempt));
            }
            let mut name = name.clone();
            name.resize(64, 0);
            self.name = name.try_into().unwrap();
        }

        Ok(())
    }

    /// If provided, set the metadata for the function routine for easier identification.
    ///
    /// # Errors
    ///
    /// Returns an error if the length of the metadata is greater than 256 bytes.
    pub fn set_metadata(&mut self, metadata: &Option<Vec<u8>>) -> Result<()> {
        if let Some(metadata) = metadata {
            if metadata.len() > 256 {
                return Err(error!(SwitchboardError::IllegalExecuteAttempt));
            }
            let mut metadata = metadata.clone();
            metadata.resize(256, 0);
            self.metadata = metadata.try_into().unwrap();
        }

        Ok(())
    }

    /// If provided, set the bounty for the routine. The bounty is used
    /// to reward the verifier for expediting the request.
    pub fn set_bounty(&mut self, bounty: &Option<u64>) -> Result<()> {
        if let Some(bounty) = bounty {
            self.bounty = *bounty;
        }

        Ok(())
    }

    /// Sets the schedule for the routine.
    /// If the schedule is empty, then disable the function routine's status.
    ///
    /// # Arguments
    ///
    /// * `schedule` - A slice of bytes representing the schedule.
    ///
    /// # Errors
    ///
    /// Returns an error if the length of the schedule is greater than 64.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the schedule is set successfully.
    pub fn set_schedule(&mut self, schedule: &[u8]) -> Result<()> {
        if schedule.len() > 64 {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        let mut schedule = schedule.to_vec();
        schedule.resize(64, 0);
        self.schedule = schedule.try_into().unwrap();

        // self.set_schedule_status()

        Ok(())
    }

    /// Checks if the schedule is empty by reading the first byte.
    ///
    /// # Returns
    ///
    /// A boolean indicating whether the schedule is empty or not.
    pub fn is_empty_schedule(&self) -> bool {
        self.schedule
            .first()
            .map(|&byte| byte == 0)
            .unwrap_or(false)
    }

    /// Returns a bool representing whether the routine is disabled for use.
    pub fn is_disabled(&self) -> bool {
        self.is_disabled.into()
    }

    /// Sets the container parameters for the routine. Optionally pass a param to append the bytes
    /// to the existing container parameters.
    ///
    /// # Arguments
    ///
    /// * `container_params` - A mutable reference to a vector of bytes representing the container parameters.
    /// * `append_container_params` - A boolean indicating whether to append the container parameters to the existing ones or replace them.
    ///
    /// # Errors
    ///
    /// Returns an error if the length of the container parameters exceeds the maximum allowed length.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the operation was successful.
    pub fn set_container_params(
        &mut self,
        container_params: &mut Vec<u8>,
        append_container_params: bool,
    ) -> Result<()> {
        let max_len = self.max_container_params_len as usize;

        if append_container_params {
            if self.container_params.len() + container_params.len() > max_len {
                return Err(error!(SwitchboardError::IllegalExecuteAttempt));
            }

            self.container_params.append(container_params);
        } else {
            if container_params.len() > max_len {
                return Err(error!(SwitchboardError::IllegalExecuteAttempt));
            }
            self.container_params = container_params.clone();
        }

        self.container_params_hash = solana_program::hash::hash(&self.container_params).to_bytes();

        Ok(())
    }

    /// Increments the queue index and wraps around if it exceeds the queue's data length.
    /// Used to provide round-robin oracle assignment.
    fn increment_queue_idx(&mut self, queue_data_len: u32) {
        self.queue_idx += 1;
        self.queue_idx %= queue_data_len;
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
        verifier: &Pubkey,
        enclave_signer: &Pubkey,
        next_allowed_timestamp: i64,
        queue_data_len: u32,
    ) -> Result<()> {
        self.last_execution_timestamp = clock.unix_timestamp;

        // We should always set this to prevent repeated save_results
        self.next_allowed_timestamp = next_allowed_timestamp;

        self.verifier = *verifier;

        // Increment the queue idx for round robin assignment
        self.increment_queue_idx(queue_data_len);

        // Errors
        // 0            : No error
        // 1 - 199      : User defined errors, still successful
        // 200 - 255    : Switchboard errors, verification failed
        self.error_status = error_code;
        if self.error_status < 200 {
            // No error, success
            self.enclave_signer = *enclave_signer;
            self.last_successful_execution_timestamp = clock.unix_timestamp;
        } else {
            // Failure
            self.enclave_signer = Pubkey::default();
        }

        Ok(())
    }
}

impl Default for FunctionRoutineAccountData {
    fn default() -> Self {
        Self {
            // Metadata
            name: [0u8; 64],
            metadata: [0u8; 256],
            created_at: 0,
            updated_at: 0,

            // Disabled
            is_disabled: ResourceLevel::None,

            // Status
            status: RoutineStatus::None,
            error_status: 0,
            enclave_signer: Pubkey::default(),
            verifier: Pubkey::default(),

            // Fees
            bounty: 0,

            // Accounts
            authority: Pubkey::default(),
            payer: Pubkey::default(),
            function: Pubkey::default(),
            attestation_queue: Pubkey::default(),

            escrow_wallet: Pubkey::default(),
            escrow_token_wallet: Pubkey::default(),

            // Execution
            queue_idx: 0,
            schedule: [0u8; 64],
            max_container_params_len: 0,
            container_params_hash: [0u8; 32],
            container_params: vec![],

            // Status / Tracking
            last_execution_timestamp: 0,
            last_successful_execution_timestamp: 0,
            next_allowed_timestamp: 0,

            // Reserved
            _ebuf: [0u8; 512],
        }
    }
}
