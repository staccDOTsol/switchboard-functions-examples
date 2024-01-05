use crate::*;

impl SbState {
    pub fn size() -> usize {
        std::mem::size_of::<SbState>() + 8
    }

    pub fn key_from(program_id: &Pubkey, mut bump: Option<u8>) -> Result<(Pubkey, Vec<Vec<u8>>)> {
        let mut seeds: Vec<Vec<u8>> = vec![STATE_SEED.to_vec()];
        if bump.is_none() {
            let (_pubkey, state_bump) =
                Pubkey::find_program_address(&to_seed_refs(&seeds), program_id);
            bump = Some(state_bump);
        }
        seeds.push(vec![bump.unwrap()]);
        let pubkey = Pubkey::create_program_address(&to_seed_refs(&seeds), program_id)
            .map_err(|_| SwitchboardError::PdaDeriveError)?;
        Ok((pubkey, seeds))
    }
}
impl Default for SbState {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
