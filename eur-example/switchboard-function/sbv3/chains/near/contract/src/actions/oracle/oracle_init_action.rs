use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct OracleInit {
    pub address: Uuid,
    pub authority: String,
    pub queue: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
}
impl Action for OracleInit {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        require(
            ctx.oracles.get(&self.address).is_none(),
            Error::InvalidOracle,
        )?;
        ctx.queues.get(&self.queue).ok_or(Error::InvalidQueue)?;
        require(self.address != Uuid::default(), Error::InvalidKey)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let oracle = Oracle {
            name: shrink_to(self.name.clone(), 256),
            metadata: shrink_to(self.metadata.clone(), 256),
            authority: self.authority.clone(),
            queue: self.queue,
            address: self.address,
            creation_timestamp: now_seconds(),
            ..Default::default()
        };
        // TODO: add storage deposit check
        ctx.oracles.insert(&self.address, &oracle);
        let mint = ctx.queues.get(&self.queue).unwrap().mint;
        let escrow_key = oracle.escrow_key(&mint);
        let escrow = Escrow {
            address: escrow_key,
            mint: mint,
            amount: 0,
            authority: None,
            amount_locked: 0,
            program_controlled: true,
            creation_timestamp: now_seconds(),
            last_transfer_timestamp: 0,
            last_delegation_timestamp: 0,
            last_delegation_block: 0,
            _ebuf: Default::default(),
            features: Default::default(),
        };
        if ctx.escrows.get(&escrow_key).is_some() {
            return Error::InvalidEscrow.into();
        }
        // TODO: add storage deposit check
        ctx.escrows.insert(&escrow_key, &escrow);
        Ok(())
    }
}
