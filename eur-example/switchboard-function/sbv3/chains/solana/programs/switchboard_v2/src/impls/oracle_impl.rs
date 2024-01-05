use crate::*;

impl<'a> OracleAccountData {
    pub fn size() -> usize {
        std::mem::size_of::<OracleAccountData>() + 8
    }

    pub fn update_reputation(&mut self, response_type: OracleResponseType) {
        match response_type {
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

    pub fn key_from_seed(
        program_id: &'a Pubkey,
        queue: &'a Pubkey,
        wallet: &'a Pubkey,
        mut bump: Option<u8>,
    ) -> Result<(Pubkey, Vec<Vec<u8>>, u8)> {
        let mut seeds: Vec<Vec<u8>> = vec![
            ORACLE_SEED.to_vec(),
            queue.as_ref().to_vec(),
            wallet.as_ref().to_vec(),
        ];
        if bump.is_none() {
            let (_oracle_pubkey, oracle_bump) =
                Pubkey::find_program_address(&to_seed_refs(&seeds), program_id);
            bump = Some(oracle_bump);
        }
        seeds.push(vec![bump.unwrap()]);
        let pubkey = Pubkey::create_program_address(&to_seed_refs(&seeds), program_id)
            .map_err(|_| error!(SwitchboardError::PdaDeriveError))?;
        Ok((pubkey, seeds, bump.unwrap()))
    }
}
impl Default for OracleAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
