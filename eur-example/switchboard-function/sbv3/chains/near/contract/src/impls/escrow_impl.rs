use crate::*;

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug)]
pub struct Escrow {
    pub address: Uuid,
    pub mint: String,
    pub amount: u128,
    pub authority: Option<String>,
    pub amount_locked: u128,
    pub program_controlled: bool,
    pub creation_timestamp: u64,
    pub last_transfer_timestamp: u64,
    pub last_delegation_timestamp: u64,
    pub last_delegation_block: u64,
    pub _ebuf: Vec<u8>,
    pub features: Vec<u8>,
}

impl Escrow {
    pub fn send(&mut self, ctx: &mut Contract, to: &mut Escrow, amount: u128) -> Result<(), Error> {
        if !self.program_controlled {
            assert_authorized(self)?;
        }
        ctx.escrows.get(&to.address).ok_or(Error::InvalidEscrow)?;
        ctx.escrows.get(&self.address).ok_or(Error::InvalidEscrow)?;
        require(self.mint == to.mint, Error::MintMismatch)?;
        let available_value = self.amount.checked_sub(self.amount_locked).unwrap();
        require(available_value >= amount, Error::InsufficientBalance)?;
        if amount == 0 {
            return Ok(());
        }
        to.amount = to.amount.checked_add(amount).unwrap();
        self.amount = self.amount.checked_sub(amount).unwrap();
        to.last_transfer_timestamp = now_seconds();
        self.last_transfer_timestamp = now_seconds();
        ctx.escrows.insert(&to.address, &to);
        ctx.escrows.insert(&self.address, &self);
        Ok(())
    }

    pub fn simulate_send(&self, ctx: &Contract, to: &Escrow, amount: u128) -> Result<(), Error> {
        if !self.program_controlled {
            assert_authorized(self)?;
        }
        ctx.escrows.get(&to.address).ok_or(Error::InvalidEscrow)?;
        ctx.escrows.get(&self.address).ok_or(Error::InvalidEscrow)?;
        require(self.mint == to.mint, Error::MintMismatch)?;
        let available_value = self.amount.checked_sub(self.amount_locked).unwrap();
        require(available_value >= amount, Error::InsufficientBalance)?;
        if amount == 0 {
            return Ok(());
        }
        to.amount.checked_add(amount).unwrap();
        self.amount.checked_sub(amount).unwrap();
        Ok(())
    }

    pub fn available_amount(&self) -> u128 {
        self.amount.checked_sub(self.amount_locked).unwrap()
    }
}
impl Managed for Escrow {
    fn authority(&self) -> String {
        self.authority.as_ref().unwrap().clone()
    }
}
