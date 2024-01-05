use crate::*;
use solana_program::borsh0_10::get_instance_packed_len;

#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionRequestTriggerRound {
    /// The status of the request.
    pub status: RequestStatus,
    /// The SOL bounty in lamports used to incentivize a verifier to expedite the request.
    pub bounty: u64,
    /// The slot the request was published
    pub request_slot: u64,
    /// The slot when the request was fulfilled
    pub fulfilled_slot: u64,
    /// The slot when the request will expire and be able to be closed by the non-authority account
    pub expiration_slot: u64,
    /// The EnclaveAccount who verified the enclave for this request
    pub verifier: Pubkey,
    /// The keypair generated in the enclave and required to sign any
    /// valid transactions processed by the function.
    pub enclave_signer: Pubkey,

    /// The slot when the request can first be executed.
    pub valid_after_slot: u64,

    // The queue idx
    pub queue_idx: u32,

    /// Reserved.
    pub _ebuf: [u8; 52],
}
impl Default for FunctionRequestTriggerRound {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}

#[account]
pub struct FunctionRequestAccountData {
    // Up-Front Params for RPC filtering
    /// Whether the request is ready to be processed.
    pub is_triggered: u8,
    /// The status of the current request.
    pub status: RequestStatus,

    // Accounts
    /// Signer allowed to cancel the request.
    pub authority: Pubkey,
    /// The default destination for rent exemption when the account is closed.
    pub payer: Pubkey,
    /// The function that can process this request
    pub function: Pubkey,
    /// The tokenAccount escrow
    pub escrow: Pubkey,
    /// The Attestation Queue for this request.
    pub attestation_queue: Pubkey,

    // Rounds
    /// The current active request.
    pub active_request: FunctionRequestTriggerRound,
    /// The previous request.
    pub previous_request: FunctionRequestTriggerRound,

    // Container Params
    /// The maximum number of bytes to pass to the container params.
    pub max_container_params_len: u32,
    /// Hash of the serialized container_params to prevent RPC tampering.
    /// Should be verified within your function to ensure you are using the correct parameters.
    pub container_params_hash: [u8; 32],
    /// The stringified container params to pass to the function.
    pub container_params: Vec<u8>,

    // Metadata
    /// The unix timestamp when the function was created.
    pub created_at: i64,
    /// The slot when the account can be garbage collected and closed by anyone for a portion of the rent.
    pub garbage_collection_slot: Option<u64>,

    /// The last recorded error code if most recent response was an error.
    pub error_status: u8,

    /// Reserved.
    pub _ebuf: [u8; 255],
}
impl Default for FunctionRequestAccountData {
    fn default() -> Self {
        Self {
            is_triggered: 0,
            status: RequestStatus::None,
            authority: Pubkey::default(),
            payer: Pubkey::default(),
            function: Pubkey::default(),
            escrow: Pubkey::default(),
            attestation_queue: Pubkey::default(),
            active_request: FunctionRequestTriggerRound::default(),
            previous_request: FunctionRequestTriggerRound::default(),
            max_container_params_len: 0,
            container_params_hash: [0u8; 32],
            container_params: Vec::new(),
            created_at: 0,
            garbage_collection_slot: None,
            error_status: 0,
            _ebuf: [0u8; 255],
        }
    }
}

impl FunctionRequestAccountData {
    pub fn space(len: Option<u32>) -> usize {
        let base: usize = 8  // discriminator
            + get_instance_packed_len(&FunctionRequestAccountData::default()).unwrap();
        let vec_elements: usize = len.unwrap_or(DEFAULT_MAX_CONTAINER_PARAMS_LEN) as usize;
        base + vec_elements
    }

    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        &mut self,
        clock: &Clock,
        function: &Pubkey,
        attestation_queue: &Pubkey,
        escrow: &Pubkey,
        authority: &Pubkey,
        container_params: Option<Vec<u8>>,
        max_container_params_len: Option<u32>,
        garbage_collection_slot: Option<u64>,
    ) -> Result<()> {
        if self.created_at > 0 {
            return Err(error!(SwitchboardError::RequestAlreadyInitialized));
        }

        self.is_triggered = 0;
        self.status = RequestStatus::RequestPending;

        self.authority = *authority;
        self.function = *function;
        self.attestation_queue = *attestation_queue;
        self.escrow = *escrow;

        self.created_at = clock.unix_timestamp;
        self.garbage_collection_slot = garbage_collection_slot;

        // needs to be set before we set the params
        if let Some(max_container_params_len) = max_container_params_len {
            self.max_container_params_len = max_container_params_len;
        } else {
            // should give them some wiggle room to expand later
            self.max_container_params_len = DEFAULT_MAX_CONTAINER_PARAMS_LEN;
        }

        if let Some(mut container_params) = container_params {
            self.set_container_params(&mut container_params, false)?;
        }

        Ok(())
    }

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
                return Err(error!(SwitchboardError::ContainerParamsTooLong));
            }
            self.container_params = container_params.clone();
        }

        self.container_params_hash = solana_program::hash::hash(&self.container_params).to_bytes();

        Ok(())
    }

    // verify if their is a non-expired pending request
    pub fn is_round_active(&self, clock: &Clock) -> bool {
        // 1. check status enum
        if !self.active_request.status.is_active() {
            return false;
        }

        // 2. check valid after slot
        // TODO: we should throw a more descriptive error for this
        if clock.slot < self.active_request.valid_after_slot {
            return false;
        }

        // 3. check expiration
        if self.active_request.expiration_slot > 0
            && clock.slot >= self.active_request.expiration_slot
        {
            return false;
        }

        true
    }

    pub fn init_new_round(
        &mut self,
        verifier: Pubkey,
        clock: &Clock,
        queue_idx: u32,
        bounty: Option<u64>,
        slots_until_expiration: Option<u64>,
        valid_after_slot: Option<u64>,
    ) -> Result<()> {
        // set up-front flags
        self.is_triggered = 1;
        self.status = RequestStatus::RequestPending;

        // 0 means valid immediately
        let valid_after_slot = valid_after_slot.unwrap_or_default();
        // slot when the request can be executed, set to current slot if another slot isnt provided
        let target_execution_slot = valid_after_slot.max(clock.slot);
        // 0 means request is always valid
        let expiration_slot = if let Some(slots_until_expiration) = slots_until_expiration {
            target_execution_slot + slots_until_expiration
        } else {
            0
        };

        // save previous round
        self.previous_request = self.active_request;

        // create new round
        self.active_request = FunctionRequestTriggerRound {
            status: RequestStatus::RequestPending,
            bounty: bounty.unwrap_or_default(),
            request_slot: clock.slot,
            fulfilled_slot: 0,
            expiration_slot,
            valid_after_slot,
            verifier,
            enclave_signer: Pubkey::default(),
            queue_idx: queue_idx,
            _ebuf: [0u8; 52],
        };

        Ok(())
    }

    // TODO: add request action when we are more confident this wont break the function runner oracles
    pub fn cancel_round(&mut self) -> Result<()> {
        self.is_triggered = 0;
        self.status = RequestStatus::RequestCancelled;
        self.active_request.status = RequestStatus::RequestCancelled;
        Ok(())
    }

    pub fn save_round(
        &mut self,
        clock: &Clock,
        error_code: u8,
        verifier: &Pubkey,
        enclave_signer: &Pubkey,
    ) -> Result<()> {
        let status = if error_code >= 200 {
            RequestStatus::RequestFailure
        } else if self.active_request.expiration_slot > 0
            && clock.slot > self.active_request.expiration_slot
        {
            RequestStatus::RequestExpired
        } else {
            RequestStatus::RequestSuccess
        };

        // set up-front flags
        self.is_triggered = 0;
        self.status = status;

        // save round
        self.active_request.status = status;
        self.active_request.verifier = *verifier;
        self.active_request.fulfilled_slot = clock.slot;

        // Errors
        // 0            : No error
        // 1 - 199      : User defined errors, still successful
        // 200 - 255    : Switchboard errors, verification failed
        self.error_status = error_code;
        if self.error_status < 200 {
            // No error, success
            self.active_request.enclave_signer = *enclave_signer;
        } else {
            // Failure
            self.active_request.enclave_signer = Pubkey::default();
        }

        Ok(())
    }
}
