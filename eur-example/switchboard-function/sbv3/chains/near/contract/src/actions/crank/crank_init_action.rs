use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct CrankInit {
    pub address: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub queue: Uuid,
    pub max_rows: u64,
}
impl Action for CrankInit {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        require(ctx.cranks.get(&self.address).is_none(), Error::InvalidCrank)?;
        ctx.queues.get(&self.queue).ok_or(Error::InvalidQueue)?;
        require(self.address != Uuid::default(), Error::InvalidKey)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut hasher = Sha256::new();
        hasher.update(b"CrankData");
        hasher.update(self.address);
        let crank = Crank {
            address: self.address,
            name: shrink_to(self.name.clone(), 256),
            metadata: shrink_to(self.metadata.clone(), 256),
            queue: self.queue,
            max_rows: self.max_rows,
            jitter_modifier: 0,
            data: Vector::new(&hasher.finalize()[..]),
            creation_timestamp: now_seconds(),
            _ebuf: Default::default(),
            features: Default::default(),
        };
        // TODO: add storage deposit check
        ctx.cranks.insert(&self.address, &crank);
        Ok(())
    }
}
