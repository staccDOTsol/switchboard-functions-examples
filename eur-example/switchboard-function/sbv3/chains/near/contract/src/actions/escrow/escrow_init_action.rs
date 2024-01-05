use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct EscrowInit {
    pub seed: [u8; 32],
    pub authority: String,
    pub mint: String,
}
impl Action for EscrowInit {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let mut hasher = Sha256::new();
        hasher.update(&b"Escrow");
        hasher.update(&self.seed);
        let address = hasher.finalize().into();
        require(ctx.escrows.get(&address).is_none(), Error::InvalidEscrow)?;
        require(self.seed != [0; 32], Error::InvalidKey)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut hasher = Sha256::new();
        hasher.update(&b"Escrow");
        hasher.update(&self.seed);
        let address = hasher.finalize().into();
        let escrow = Escrow {
            address,
            mint: self.mint.clone(),
            amount: 0,
            authority: Some(self.authority.clone()),
            amount_locked: 0,
            program_controlled: false,
            creation_timestamp: now_seconds(),
            last_transfer_timestamp: 0,
            last_delegation_timestamp: 0,
            last_delegation_block: 0,
            _ebuf: Default::default(),
            features: Default::default(),
        };
        // TODO: add storage deposit check
        ctx.escrows.insert(&escrow.address, &escrow);
        Ok(())
    }
}
