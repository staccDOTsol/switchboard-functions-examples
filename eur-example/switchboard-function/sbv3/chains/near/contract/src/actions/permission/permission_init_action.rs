use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct PermissionInit {
    pub authority: String,
    pub granter: Address,
    pub grantee: Address,
}
impl Action for PermissionInit {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let address = Permission::key(self.authority.as_bytes(), &self.granter, &self.grantee);
        require(
            ctx.permissions.get(&address).is_none(),
            Error::InvalidPermission,
        )?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let address = Permission::key(self.authority.as_bytes(), &self.granter, &self.grantee);
        let permission = Permission {
            authority: self.authority.clone(),
            granter: self.granter,
            grantee: self.grantee,
            creation_timestamp: now_seconds(),
            update_timestamp: now_seconds(),
            ..Default::default()
        };
        // TODO: add storage deposit check
        ctx.permissions.insert(&address, &permission);
        Ok(())
    }
}
