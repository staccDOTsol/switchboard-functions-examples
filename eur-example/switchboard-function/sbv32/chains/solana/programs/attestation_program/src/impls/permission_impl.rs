use crate::*;

#[account(zero_copy(unsafe))]
#[repr(packed)]
pub struct AttestationPermissionAccountData {
    pub authority: Pubkey,
    pub permissions: u32,
    pub granter: Pubkey,
    pub grantee: Pubkey,
    pub expiration: i64,
    pub bump: u8,
    pub _ebuf: [u8; 256],
}

impl AttestationPermissionAccountData {
    pub fn size() -> usize {
        8 + std::mem::size_of::<AttestationPermissionAccountData>()
    }

    pub fn has(&self, p: SwitchboardAttestationPermission) -> bool {
        self.permissions & p as u32 != 0
    }
}
