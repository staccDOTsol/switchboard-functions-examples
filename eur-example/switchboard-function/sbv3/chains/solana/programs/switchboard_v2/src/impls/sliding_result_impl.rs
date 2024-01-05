use crate::*;

impl<'a> SlidingResultAccountData {
    pub fn size() -> usize {
        std::mem::size_of::<SlidingResultAccountData>() + 8
    }

    pub fn key_from_seed(
        program_id: &'a Pubkey,
        aggregator: &'a Pubkey,
        bump: u8,
    ) -> Result<Pubkey> {
        let seeds: Vec<Vec<u8>> = vec![
            SLIDING_RESULT_SEED.to_vec(),
            aggregator.as_ref().to_vec(),
            vec![bump],
        ];
        let pubkey = Pubkey::create_program_address(&to_seed_refs(&seeds), program_id)
            .map_err(|_| error!(SwitchboardError::PdaDeriveError))?;
        Ok(pubkey)
    }

    pub fn push(
        &mut self,
        oracle_key: Pubkey,
        value: SwitchboardDecimal,
        batch_size: u32,
    ) -> Result<()> {
        let mut new_vec = self.data.to_vec();
        let clock = Clock::get()?;
        let new_val = SlidingWindowElement {
            value,
            oracle_key,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        };
        new_vec.retain(|&x| x.slot != 0);
        new_vec.retain(|&x| x.oracle_key != oracle_key);
        new_vec.insert(0, new_val);
        new_vec.truncate(batch_size.try_into().unwrap());
        new_vec.resize(self.data.len(), Default::default());
        self.data.clone_from_slice(new_vec.as_slice());
        Ok(())
    }

    pub fn get_value(&mut self, batch_size: u32) -> Result<SlidingWindowElement> {
        let mut data = self.data.to_vec();
        data.truncate(batch_size.try_into().unwrap());
        data.retain(|&el| el.slot != 0);
        Self::median(data)
    }

    pub fn get_values(&mut self, batch_size: u32) -> Vec<SwitchboardDecimal> {
        let mut data = self.data.to_vec();
        data.truncate(batch_size.try_into().unwrap());
        data.retain(|&el| el.slot != 0);
        data.iter().map(|x| x.value).collect()
    }

    pub fn median(mut data: Vec<SlidingWindowElement>) -> Result<SlidingWindowElement> {
        data.sort_by(|a, b| a.value.partial_cmp(&b.value).unwrap());
        if data.is_empty() {
            return Err(error!(SwitchboardError::NoResultsError));
        }
        let mid = data.len() / 2;
        Ok(data[mid])
    }
}
impl Default for SlidingResultAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
