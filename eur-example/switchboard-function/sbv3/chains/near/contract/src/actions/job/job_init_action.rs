use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct JobInit {
    pub address: Uuid,
    pub authority: String,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub data: Vec<u8>,
    pub expiration: u64,
}
impl Action for JobInit {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        require(ctx.jobs.get(&self.address).is_none(), Error::InvalidJob)?;
        require(self.address != Uuid::default(), Error::InvalidKey)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut hasher = Sha256::new();
        hasher.update(self.data.as_slice());
        let job = Job {
            address: self.address,
            name: shrink_to(self.name.clone(), 256),
            metadata: shrink_to(self.metadata.clone(), 256),
            authority: self.authority.clone(),
            expiration: self.expiration,
            hash: hasher.finalize().into(),
            data: self.data.clone(),
            created_at: now_seconds(),
            ..Default::default()
        };
        // TODO: add storage deposit check
        ctx.jobs.insert(&self.address, &job);
        Ok(())
    }
}
