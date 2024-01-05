use crate::*;
use anchor_lang::prelude::*;
use solana_program::instruction::Instruction;

impl VrfAccountData {
    pub fn size() -> usize {
        std::mem::size_of::<VrfAccountData>() + 8
    }

    pub fn get_callback_ixn(&self) -> Instruction {
        let callback = self.callback;
        let mut accounts: Vec<AccountMeta> = Vec::with_capacity(callback.accounts_len as usize);
        // MUST MAKE SURE THESE ACCOUNTS MATCH WHATS IN THE CALLBACK
        for idx in 0..callback.accounts_len as usize {
            accounts.push(callback.accounts[idx].into());
        }

        Instruction {
            program_id: callback.program_id,
            data: callback.ix_data[..callback.ix_data_len as usize].to_vec(),
            accounts,
        }
    }
}

impl Default for VrfAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
