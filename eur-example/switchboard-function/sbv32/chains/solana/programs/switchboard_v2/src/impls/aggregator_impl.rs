use anchor_lang::prelude::*;

use rust_decimal::Decimal;

use solana_program::clock::Clock;

use crate::*;
use solana_program::sysvar::Sysvar;
use std::convert::TryInto;

impl AggregatorAccountData {
    pub fn size() -> usize {
        std::mem::size_of::<AggregatorAccountData>() + 8
    }

    pub fn active_round(&self, unix_timestamp: i64) -> bool {
        if self.resolution_mode == AggregatorResolutionMode::ModeSlidingResolution {
            return false;
        }
        let is_valid = self.current_round.num_success >= self.min_oracle_results;
        let is_within_limit = (unix_timestamp - self.current_round.round_open_timestamp) < 60;
        !is_valid && is_within_limit
    }

    pub fn set_configs(
        &mut self,
        name: [u8; 32],
        metadata: [u8; 128],
        batch_size: u32,
        min_oracle_results: u32,
        min_job_results: u32,
        min_update_delay_seconds: u32,
        start_after: i64,
        variance_threshold: SwitchboardDecimal,
        force_report_period: i64,
        expiraiton: i64,
        authority: &Pubkey,
    ) -> Result<()> {
        self.name = name;
        self.metadata = metadata;
        self.oracle_request_batch_size = batch_size;
        self.min_oracle_results = min_oracle_results;
        self.min_job_results = min_job_results;
        self.min_update_delay_seconds = min_update_delay_seconds;
        self.start_after = start_after;
        self.variance_threshold = variance_threshold;
        self.force_report_period = force_report_period;
        self.expiration = expiraiton;
        self.authority = *authority;
        Ok(())
    }

    pub fn get_current_value(&self) -> Result<SwitchboardDecimal> {
        if !self.latest_confirmed_round.is_valid() {
            return Err(error!(SwitchboardError::InvalidAggregatorRound));
        }
        Ok(self.latest_confirmed_round.result)
    }

    pub fn get_current_value_timestamp(&self) -> Result<i64> {
        if !self.latest_confirmed_round.is_valid() {
            return Err(error!(SwitchboardError::InvalidAggregatorRound));
        }
        Ok(self.latest_confirmed_round.round_open_timestamp)
    }

    pub fn update_latest_value(
        &mut self,
        history: Option<AggregatorHistoryAccountInfo>,
    ) -> Result<()> {
        let size: usize = self.oracle_request_batch_size.try_into().unwrap();
        let median = self.current_round.median(size)?;
        self.current_round.result = SwitchboardDecimal::from_rust_decimal(median);
        self.current_round.std_deviation =
            SwitchboardDecimal::from_rust_decimal(self.current_round.std_deviation(size)?);
        if self.resolution_mode == AggregatorResolutionMode::ModeRoundResolution {
            self.latest_confirmed_round = self.current_round;
        }
        // NOOP if none or len == 0.
        if history.is_some()
            && self.resolution_mode == AggregatorResolutionMode::ModeRoundResolution
        {
            // In round resolution mode, use round open timestamp.
            history.unwrap().insert(
                self.current_round.result,
                self.current_round.round_open_timestamp,
            );
        }
        Ok(())
    }

    pub fn current_error_count(&self) -> u32 {
        self.current_round.num_error
    }

    pub fn init_new_round(&mut self, clock: &Clock, oracle_list: &Vec<Pubkey>) {
        self.previous_confirmed_round_result = self.latest_confirmed_round.result;
        self.previous_confirmed_round_slot = self.latest_confirmed_round.round_open_slot;
        self.latest_confirmed_round.is_closed = true;
        self.current_round = AggregatorRound {
            round_open_timestamp: clock.unix_timestamp,
            round_open_slot: clock.slot,
            ..Default::default()
        };
        for i in 0..oracle_list.len() {
            self.current_round.oracle_pubkeys_data[i] = oracle_list[i];
        }
    }

    pub fn apply_oracle_error(&mut self, params: &AggregatorSaveResultParamsV2) {
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

    pub fn apply_oracle_result(
        &mut self,
        params: &AggregatorSaveResultParamsV2,
        history: Option<AggregatorHistoryAccountInfo>,
        timestamp: i64,
    ) -> Result<()> {
        let value: SwitchboardDecimal = params.value.into();
        let min_response: SwitchboardDecimal = params.min_response.into();
        let max_response: SwitchboardDecimal = params.max_response.into();
        self.current_round.medians_data[params.oracle_idx as usize] = value;
        self.current_round.medians_fulfilled[params.oracle_idx as usize] = true;
        self.current_round.num_success += 1;
        if self.current_round.num_success == 1 {
            self.current_round.min_response = min_response;
            self.current_round.max_response = max_response;
        } else {
            self.current_round.min_response =
                std::cmp::min(self.current_round.min_response, min_response);
            self.current_round.max_response =
                std::cmp::max(self.current_round.max_response, max_response);
        }
        if history.is_some()
            && self.resolution_mode == AggregatorResolutionMode::ModeSlidingResolution
        {
            // Sliding window resolution should use clock timestamp, not round's timestamp
            history
                .unwrap()
                .insert(self.latest_confirmed_round.result, timestamp);
        }
        Ok(())
    }

    pub fn apply_tee_oracle_result(
        &mut self,
        params: &AggregatorTeeSaveResultParams,
        oracle_key: &Pubkey,
        history: Option<AggregatorHistoryAccountInfo>,
        timestamp: i64,
    ) -> Result<()> {
        let oracle_idx = self
            .current_round
            .oracle_pubkeys_data
            .iter()
            .position(|&r| r == *oracle_key)
            .unwrap();
        let value: SwitchboardDecimal = params.value.into();
        let min_response: SwitchboardDecimal = params.min_response.into();
        let max_response: SwitchboardDecimal = params.max_response.into();
        self.current_round.medians_data[oracle_idx] = value;
        self.current_round.medians_fulfilled[oracle_idx] = true;
        self.current_round.num_success += 1;
        if self.current_round.num_success == 1 {
            self.current_round.min_response = min_response;
            self.current_round.max_response = max_response;
        } else {
            self.current_round.min_response =
                std::cmp::min(self.current_round.min_response, min_response);
            self.current_round.max_response =
                std::cmp::max(self.current_round.max_response, max_response);
        }
        if history.is_some()
            && self.resolution_mode == AggregatorResolutionMode::ModeSlidingResolution
        {
            // Sliding window resolution should use clock timestamp, not round's timestamp
            history
                .unwrap()
                .insert(self.latest_confirmed_round.result, timestamp);
        }
        Ok(())
    }

    pub fn is_expired(&self) -> Result<bool> {
        if self.expiration == 0 {
            return Ok(false);
        }
        Ok(Clock::get()?.unix_timestamp < self.expiration)
    }

    pub fn convert_buffer<'a>(buf: &'a mut [u8]) -> AggregatorHistoryAccountInfo {
        AggregatorHistoryAccountInfo { buf }
    }

    pub fn calc_priority_fee(&self, clock: &Clock) -> u64 {
        let last_update_timestamp =
            if self.resolution_mode == AggregatorResolutionMode::ModeSlidingResolution {
                // if we use the latest confirmed timestamp then its a race to confirm first
                // only the first responder will be fully reimbursed for their priority fee
                self.latest_confirmed_round
                    .round_open_timestamp
                    .min(self.current_round.round_open_timestamp)
            } else {
                self.latest_confirmed_round.round_open_timestamp
            };
        calc_priority_fee(
            clock.unix_timestamp,
            last_update_timestamp,
            self.base_priority_fee,
            self.priority_fee_bump,
            self.priority_fee_bump_period,
            self.max_priority_fee_multiplier,
        )
    }
}

impl AggregatorRound {
    pub fn from_vec(
        mut input: Vec<SwitchboardDecimal>,
        round_open_slot: u64,
        round_open_timestamp: i64,
    ) -> Result<AggregatorRound> {
        let len = input.len();
        let mut result: AggregatorRound = Default::default();
        result.min_response = *input.iter().min().unwrap();
        result.max_response = *input.iter().max().unwrap();
        for i in 0..input.len() {
            result.medians_fulfilled[i] = true;
        }
        input.resize(16, Default::default());
        result.medians_data.clone_from_slice(input.as_slice());
        result.result = result.median(input.len())?.into();
        result.std_deviation = result.std_deviation(len)?.into();
        result.num_success = len as u32;
        result.round_open_slot = round_open_slot;
        result.round_open_timestamp = round_open_timestamp;

        Ok(result)
    }

    pub fn median(&self, size: usize) -> Result<Decimal> {
        let medians = self.medians_data;
        let mut numbers: Vec<Decimal> = medians[..size]
            .iter()
            .enumerate()
            .filter(|&(idx, _x)| self.medians_fulfilled[idx])
            .map(|(_, x)| Decimal::try_from_i128_with_scale(x.mantissa, x.scale).unwrap())
            .collect();
        numbers.sort_by(|a, b| a.partial_cmp(b).unwrap());
        if numbers.is_empty() {
            return Err(error!(SwitchboardError::NoResultsError));
        }
        let mid = numbers.len() / 2;
        if numbers.len() % 2 == 0 {
            return Ok((numbers[mid - 1].checked_add(numbers[mid])).unwrap() / Decimal::TWO);
        }
        Ok(numbers[mid])
    }

    // Standard deviation from median
    pub fn std_deviation(&self, size: usize) -> Result<Decimal> {
        let median: Decimal = self.result.try_into().unwrap();
        // let median = self.median(size)?;
        let medians = self.medians_data;
        let numbers: Vec<Decimal> = medians[..size]
            .iter()
            .enumerate()
            .filter(|&(idx, _x)| self.medians_fulfilled[idx])
            .map(|(_, x)| Decimal::try_from_i128_with_scale(x.mantissa, x.scale).unwrap())
            .collect();
        if numbers.is_empty() {
            return Err(error!(SwitchboardError::NoResultsError));
        }
        let len = numbers.len();
        let mut distances = vec![Decimal::ZERO; len];
        let mut res = Decimal::ZERO;
        for i in 0..distances.len() {
            distances[i] = numbers[i]
                .checked_sub(median)
                .ok_or(SwitchboardError::IntegerUnderflowError)?;
            distances[i] = distances[i]
                .checked_mul(distances[i])
                .ok_or(SwitchboardError::IntegerOverflowError)?;
            res = res
                .checked_add(distances[i])
                .ok_or(SwitchboardError::IntegerOverflowError)?;
        }
        res = res
            .checked_div(distances.len().into())
            .ok_or(SwitchboardError::IntegerUnderflowError)?;
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
impl Default for AggregatorAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
