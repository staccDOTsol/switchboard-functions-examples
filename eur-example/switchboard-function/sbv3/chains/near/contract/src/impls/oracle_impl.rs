use crate::*;

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct Oracle {
    pub address: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    // Can later be used to withdraw rewards and stake.
    pub authority: String,
    pub last_heartbeat: u64,
    pub num_in_use: u32,
    pub queue: Uuid,
    pub metrics: OracleMetrics,
    pub creation_timestamp: u64,
    pub total_delegated_stake: u128,
    pub _ebuf: Vec<u8>,
    pub features: Vec<u8>,
}

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub enum OracleResponseType {
    TypeNone,
    TypeSuccess,
    TypeError,
    TypeDisagreement,
    TypeNoResponse,
}
impl Default for OracleResponseType {
    fn default() -> Self {
        OracleResponseType::TypeNone
    }
}

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct OracleMetrics {
    // Metrics
    pub consecutive_success: u64,
    pub consecutive_error: u64,
    pub consecutive_disagreement: u64,
    pub consecutive_late_response: u64,
    pub consecutive_failure: u64,
    pub total_success: u128,
    pub total_error: u128,
    pub total_disagreement: u128,
    pub total_late_response: u128,
}

impl Oracle {
    pub fn escrow(&self, ctx: &Contract) -> Escrow {
        let key = self.escrow_key(&ctx.queues.get(&self.queue).unwrap().mint);
        ctx.escrows.get(&key).unwrap()
    }

    pub fn escrow_key(&self, mint: &String) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(b"OracleEscrow");
        hasher.update(mint);
        hasher.update(self.address);
        hasher.finalize().into()
    }

    pub fn update_reputation(&mut self, response_type: OracleResponseType) {
        match response_type {
            OracleResponseType::TypeNone => {}
            OracleResponseType::TypeSuccess => {
                self.metrics.consecutive_success =
                    self.metrics.consecutive_success.checked_add(1).unwrap();
                self.metrics.total_success = self.metrics.total_success.checked_add(1).unwrap();
                self.metrics.consecutive_failure = 0;
                self.metrics.consecutive_error = 0;
                self.metrics.consecutive_disagreement = 0;
                self.metrics.consecutive_late_response = 0;
            }
            OracleResponseType::TypeError => {
                self.metrics.consecutive_error =
                    self.metrics.consecutive_error.checked_add(1).unwrap();
                self.metrics.total_error = self.metrics.total_error.checked_add(1).unwrap();
                self.metrics.consecutive_failure =
                    self.metrics.consecutive_failure.checked_add(1).unwrap();
                self.metrics.consecutive_success = 0;
                self.metrics.consecutive_disagreement = 0;
                self.metrics.consecutive_late_response = 0;
            }
            OracleResponseType::TypeDisagreement => {
                self.metrics.consecutive_disagreement = self
                    .metrics
                    .consecutive_disagreement
                    .checked_add(1)
                    .unwrap();
                self.metrics.total_disagreement =
                    self.metrics.total_disagreement.checked_add(1).unwrap();
                self.metrics.consecutive_failure =
                    self.metrics.consecutive_failure.checked_add(1).unwrap();
                self.metrics.consecutive_success = 0;
                self.metrics.consecutive_error = 0;
                self.metrics.consecutive_late_response = 0;
            }
            OracleResponseType::TypeNoResponse => {
                self.metrics.consecutive_late_response = self
                    .metrics
                    .consecutive_late_response
                    .checked_add(1)
                    .unwrap();
                self.metrics.total_late_response =
                    self.metrics.total_late_response.checked_add(1).unwrap();
                self.metrics.consecutive_failure =
                    self.metrics.consecutive_failure.checked_add(1).unwrap();
                self.metrics.consecutive_success = 0;
                self.metrics.consecutive_error = 0;
                self.metrics.consecutive_disagreement = 0;
            }
        }
    }
}
impl Managed for Oracle {
    fn authority(&self) -> String {
        self.authority.clone()
    }
}
