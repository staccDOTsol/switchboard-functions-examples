use crate::*;
use core::ops::BitAnd;

#[derive(Default, BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct Permission {
    pub authority: String,
    pub permissions: u32,
    pub granter: Uuid,
    pub grantee: Uuid,
    // unused currently. may want permission PDA per permission for
    // unique expiration periods, BUT currently only one permission
    // per account makes sense for the infra. Dont over engineer.
    pub expiration: u64,
    pub creation_timestamp: u64,
    pub update_timestamp: u64,
    pub _ebuf: Vec<u8>,
    pub features: Vec<u8>,
}

impl Permission {
    pub fn get(ctx: &Contract, authority: &String, granter: &[u8], grantee: &[u8]) -> Option<Self> {
        let key = Self::key(authority.as_bytes(), granter, grantee);
        ctx.permissions.get(&key)
    }

    pub fn key(authority: &[u8], granter: &[u8], grantee: &[u8]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(b"Permission");
        hasher.update(authority);
        hasher.update(granter);
        hasher.update(grantee);
        hasher.finalize().into()
    }

    pub fn has(&self, permission: SwitchboardPermission) -> bool {
        self.permissions & permission
    }
}

#[repr(u32)]
#[derive(Copy, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub enum SwitchboardPermission {
    None = 0 << 0,
    PermitOracleHeartbeat = 1 << 0,
    PermitOracleQueueUsage = 1 << 1,
    PermitVrfRequests = 1 << 2,
}
impl Default for SwitchboardPermission {
    fn default() -> Self {
        SwitchboardPermission::None
    }
}

impl BitAnd<SwitchboardPermission> for u32 {
    type Output = bool;
    fn bitand(self, rhs: SwitchboardPermission) -> bool {
        (self & rhs as u32) != 0u32
    }
}
impl Managed for Permission {
    fn authority(&self) -> String {
        self.authority.clone()
    }
}
