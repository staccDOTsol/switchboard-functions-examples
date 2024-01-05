use crate::*;
use near_sdk::env::block_height;
use rust_decimal::Decimal;
use std::convert::TryInto;

#[derive(BorshSerialize, BorshDeserialize)]
pub struct Aggregator {
    pub address: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub queue: Uuid,
    // CONFIGS
    pub oracle_request_batch_size: u32,
    pub min_oracle_results: u32,
    pub min_job_results: u32,
    pub min_update_delay_seconds: u32,
    pub start_after: u64, // timestamp to start feed updates at
    pub variance_threshold: SwitchboardDecimal,
    pub force_report_period: u64, // If no feed results after this period, trigger nodes to report
    pub expiration: u64,
    //
    pub consecutive_failure_count: u64,
    pub next_allowed_update_time: u64,
    pub is_locked: bool,
    pub crank: Uuid,
    pub crank_row_count: u32,
    pub latest_confirmed_round: AggregatorRound,
    pub current_round: AggregatorRound,
    pub jobs: Vec<Uuid>,
    pub jobs_checksum: Vec<u8>, // Used to confirm with oracles they are answering what they think theyre answering
    //
    pub authority: String,
    // Maybe keep as separate account so no need to parse on lookup table?
    pub history: Vector<AggregatorHistoryRow>,
    pub history_limit: u64,
    pub history_write_idx: u64,
    pub previous_confirmed_round_result: SwitchboardDecimal,
    pub previous_confirmed_round_slot: u64,
    pub job_weights: Vec<u8>,
    pub creation_timestamp: u64,
    pub read_charge: u128,
    pub reward_escrow: Uuid,
    pub max_gas_cost: u128, // 0 means no limit
    pub whitelisted_readers: Vec<Uuid>,
    pub allow_whitelist_only: bool,
    pub _ebuf: Vec<u8>,
    pub features: Vec<u8>,
}
#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorRound {
    pub id: u128,
    // Maintains the number of successful responses received from nodes.
    // Nodes can submit one successful response per round.
    pub num_success: u32,
    pub num_error: u32,
    pub is_closed: bool,
    // Maintains the `solana_program::clock::Slot` that the round was opened at.
    pub round_open_slot: u64,
    // Maintains the `solana_program::clock::UnixTimestamp;` the round was opened at.
    pub round_open_timestamp: u64,
    // Maintains the current median of all successful round responses.
    pub result: SwitchboardDecimal,
    // Standard deviation of the accepted results in the round.
    pub std_deviation: SwitchboardDecimal,
    // Maintains the minimum node response this round.
    pub min_response: SwitchboardDecimal,
    // Maintains the maximum node response this round.
    pub max_response: SwitchboardDecimal,
    // pub lease_key: Uuid,
    // Uuids of the oracles fulfilling this round.
    pub oracles: Vec<Uuid>,
    // pub oracle_keys_size: u32, IMPLIED BY ORACLE_REQUEST_BATCH_SIZE
    // Represents all successful node responses this round. `NaN` if empty.
    pub medians_data: Vec<SwitchboardDecimal>,
    // Current rewards/slashes oracles have received this round.
    pub current_payout: Vec<i64>,
    // Optionals do not work on zero_copy. Keep track of which responses are
    // fulfilled here.
    pub medians_fulfilled: Vec<bool>,
    // could do specific error codes
    pub errors_fulfilled: Vec<bool>,
    pub _ebuf: Vec<u8>,
    pub features: Vec<u8>,
}
#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorHistoryRow {
    pub round_id: u128, // 16
    pub timestamp: u64, // 8
    pub value: SwitchboardDecimal, // 20
}


impl Aggregator {
    pub fn escrow_key(&self, mint: &String) -> Uuid {
        Self::escrow_key_from_addr(&self.address, mint)
    }

    pub fn escrow_key_from_addr(addr: &Uuid, mint: &String) -> Uuid {
        let mut hasher = Sha256::new();
        hasher.update(b"AggregatorEscrow");
        hasher.update(mint);
        hasher.update(addr);
        hasher.finalize().into()
    }

    pub fn escrow(&self, ctx: &Contract) -> Escrow {
        let key = self.escrow_key(&ctx.queues.get(&self.queue).unwrap().mint);
        ctx.escrows.get(&key).unwrap()
    }

    pub fn get_current_value(&self) -> Result<SwitchboardDecimal, Error> {
        if !self.latest_confirmed_round.is_valid() {
            return Error::InvalidAggregatorRound.into();
        }
        Ok(self.latest_confirmed_round.result)
    }

    pub fn get_current_value_timestamp(&self) -> Result<u64, Error> {
        if !self.latest_confirmed_round.is_valid() {
            return Error::InvalidAggregatorRound.into();
        }
        Ok(self.latest_confirmed_round.round_open_timestamp)
    }

    pub fn add_history_rows(&mut self, num_rows: u32) -> Result<(), Error> {
        let default_row = AggregatorHistoryRow::default();
        for _ in 0..num_rows {
            self.history.push(&default_row);
        }

        self.history_limit = self.history.len();
        Ok(())
    }

    pub fn update_latest_value(
        &mut self,
        // history: Option<AggregatorHistoryAccountInfo>,
    ) -> Result<(), Error> {
        let size: usize = self.oracle_request_batch_size.try_into().unwrap();
        let median = self.current_round.median(size)?;
        self.current_round.result = SwitchboardDecimal::from_rust_decimal(median);
        self.current_round.std_deviation =
            SwitchboardDecimal::from_rust_decimal(self.current_round.std_deviation(size)?);
        self.latest_confirmed_round = self.current_round.clone();
        if self.history_limit == 0 {
            return Ok(());
        }
        let new_entry = AggregatorHistoryRow {
            round_id: self.current_round.id,
            timestamp: now_seconds(),
            value: self.current_round.result,
        };
        // Matches first entry
        if self.history_write_idx == self.history.len() {
            self.history.push(&new_entry);
            return Ok(());
        }

        // Matches equal case
        let hist_round = self.history.get(self.history_write_idx).unwrap().round_id;
        if hist_round == self.current_round.id {
            self.history.replace(self.history_write_idx, &new_entry);
            return Ok(());
        }
        self.history_write_idx += 1;
        self.history_write_idx %= self.history_limit;
        if self.history_write_idx >= self.history.len() {
            // TODO: add storage deposit check
            self.history.push(&new_entry);
            return Ok(());
        }
        self.history.replace(self.history_write_idx, &new_entry);
        Ok(())
    }

    pub fn current_error_count(&self) -> u32 {
        self.current_round.num_error
    }

    pub fn init_new_round(&mut self, oracle_list: &Vec<Uuid>) {
        self.previous_confirmed_round_result = self.latest_confirmed_round.result;
        self.previous_confirmed_round_slot = self.latest_confirmed_round.round_open_slot;
        self.latest_confirmed_round.is_closed = true;
        self.current_round = AggregatorRound {
            round_open_timestamp: now_seconds(),
            round_open_slot: block_height(),
            id: self.current_round.id + 1,
            oracles: oracle_list.clone(),
            medians_data: vec![Default::default(); oracle_list.len()],
            current_payout: vec![Default::default(); oracle_list.len()],
            medians_fulfilled: vec![Default::default(); oracle_list.len()],
            errors_fulfilled: vec![Default::default(); oracle_list.len()],
            ..Default::default()
        };
    }

    pub fn apply_oracle_error(&mut self, params: &AggregatorSaveResult) {
        self.current_round.num_error += 1;
        self.current_round.errors_fulfilled[params.oracle_idx as usize] = true;
    }

    pub fn apply_last_failure_check(&mut self) {
        if !self.current_round.is_closed && self.current_round.num_success < self.min_oracle_results
        {
            self.consecutive_failure_count = self.consecutive_failure_count.checked_add(1).unwrap();
        } else {
            self.consecutive_failure_count = 0;
        }
    }

    pub fn apply_oracle_result(&mut self, params: &AggregatorSaveResult) -> Result<(), Error> {
        let value: SwitchboardDecimal = params.value.into();
        let min_response: SwitchboardDecimal = params.min_response.into();
        let max_response: SwitchboardDecimal = params.max_response.into();
        self.current_round.medians_data[params.oracle_idx as usize] = value;
        self.current_round.medians_fulfilled[params.oracle_idx as usize] = true;
        self.current_round.num_success += 1;
        if self.current_round.num_success <= 1 {
            self.current_round.min_response = min_response;
            self.current_round.max_response = max_response;
        } else {
            self.current_round.min_response =
                std::cmp::min(self.current_round.min_response, min_response);
            self.current_round.max_response =
                std::cmp::max(self.current_round.max_response, max_response);
        }
        Ok(())
    }

    pub fn is_expired(&self) -> Result<bool, Error> {
        if self.expiration == 0 {
            return Ok(false);
        }
        Ok(now_seconds() < self.expiration)
    }

    pub fn generate_checksum(&self, ctx: &Contract) -> Vec<u8> {
        let mut hasher = Sha256::default();
        for key in self.jobs.iter() {
            let mut inner_hasher = Sha256::default();
            inner_hasher.update(&ctx.jobs.get(&key).unwrap().data);
            hasher.update(inner_hasher.finalize());
        }
        let checksum = hasher.finalize();
        checksum.as_slice().to_vec()
    }
}

impl AggregatorRound {
    pub fn median(&self, size: usize) -> Result<Decimal, Error> {
        let medians = &self.medians_data;
        let mut numbers: Vec<Decimal> = medians[..size]
            .into_iter()
            .enumerate()
            .filter(|&(idx, _x)| self.medians_fulfilled[idx] == true)
            .map(|(_, x)| Decimal::try_from_i128_with_scale(x.mantissa, x.scale).unwrap())
            .collect();
        numbers.sort_by(|a, b| a.partial_cmp(b).unwrap());
        if numbers.len() == 0 {
            return Error::NoResult.into();
        }
        let mid = numbers.len() / 2;
        if numbers.len() % 2 == 0 {
            return Ok((numbers[mid - 1].checked_add(numbers[mid])).unwrap() / Decimal::TWO);
        }
        Ok(numbers[mid])
    }

    // Standard deviation from median
    pub fn std_deviation(&self, size: usize) -> Result<Decimal, Error> {
        let median: Decimal = self.result.try_into().unwrap();
        // let median = self.median(size)?;
        let medians = &self.medians_data;
        let numbers: Vec<Decimal> = medians[..size]
            .into_iter()
            .enumerate()
            .filter(|&(idx, _x)| self.medians_fulfilled[idx] == true)
            .map(|(_, x)| Decimal::try_from_i128_with_scale(x.mantissa, x.scale).unwrap())
            .collect();
        if numbers.len() == 0 {
            return Error::NoResult.into();
        }
        let len = numbers.len();
        let mut distances = vec![Decimal::ZERO; len];
        let mut res = Decimal::ZERO;
        for i in 0..distances.len() {
            distances[i] = numbers[i].checked_sub(median).ok_or(Error::MathUnderflow)?;
            distances[i] = distances[i]
                .checked_mul(distances[i])
                .ok_or(Error::MathOverflow)?;
            res = res.checked_add(distances[i]).ok_or(Error::MathOverflow)?;
        }
        res = res
            .checked_div(distances.len().into())
            .ok_or(Error::MathUnderflow)?;
        Ok(Self::sqrt(&res).unwrap())
    }

    // COPIED from rust_decimal crate "maths" feature. Incompatible toolchains
    // prevent enabling this from the library feature.
    fn sqrt(d: &Decimal) -> Option<Decimal> {
        if d.is_sign_negative() {
            return None;
        }
        if d.is_zero() {
            return Some(Decimal::ZERO);
        }
        // Start with an arbitrary number as the first guess
        let mut result = d / Decimal::TWO;
        // Too small to represent, so we start with d
        // Future iterations could actually avoid using a decimal altogether and use a buffered
        // vector, only combining back into a decimal on return
        if result.is_zero() {
            result = *d;
        }
        let mut last = result + Decimal::ONE;
        // Keep going while the difference is larger than the tolerance
        let mut circuit_breaker = 0;
        while last != result {
            circuit_breaker += 1;
            assert!(circuit_breaker < 1000, "geo mean circuit breaker");

            last = result;
            result = (result + d / result) / Decimal::TWO;
        }
        Some(result)
    }

    pub fn is_valid(&self) -> bool {
        self.round_open_slot != 0
    }
}
impl Managed for Aggregator {
    fn authority(&self) -> String {
        self.authority.clone()
    }
}
