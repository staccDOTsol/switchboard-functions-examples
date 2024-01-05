use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct ViewPermission {
    pub address: Uuid,
}
impl ViewPermission {
    pub fn actuate(&self, ctx: &Contract) -> Result<Permission, Error> {
        let permission = ctx
            .permissions
            .get(&self.address)
            .ok_or(Error::InvalidPermission)?;
        Ok(permission)
    }
}
