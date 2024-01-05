use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct PermissionSet {
    pub address: Uuid,
    pub permission: u32,
    pub enable: bool,
}
impl Action for PermissionSet {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let permission = ctx
            .permissions
            .get(&self.address)
            .ok_or(Error::InvalidPermission)?;
        assert_authorized(&permission)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut permission = ctx.permissions.get(&self.address).unwrap();
        if self.enable {
            permission.permissions |= self.permission;
        } else {
            permission.permissions &= !self.permission;
        }
        permission.update_timestamp = now_seconds();
        ctx.permissions.insert(&self.address, &permission);
        Ok(())
    }
}
