use crate::*;

impl<'a> PermissionAccountData {
    pub fn size() -> usize {
        std::mem::size_of::<PermissionAccountData>() + 8
    }

    pub fn key_from_seed(
        program_id: &'a Pubkey,
        authority: &'a Pubkey,
        granter: &'a Pubkey,
        grantee: &'a Pubkey,
        mut bump: Option<u8>,
    ) -> Result<(Pubkey, Vec<Vec<u8>>, u8)> {
        let mut seeds: Vec<Vec<u8>> = vec![
            PERMISSION_SEED.to_vec(),
            authority.as_ref().to_vec(),
            granter.as_ref().to_vec(),
            grantee.as_ref().to_vec(),
        ];
        if bump.is_none() {
            let (_permission_pubkey, permission_bump) =
                Pubkey::find_program_address(&to_seed_refs(&seeds), program_id);
            bump = Some(permission_bump);
        }
        seeds.push(vec![bump.unwrap()]);
        let pubkey = Pubkey::create_program_address(&to_seed_refs(&seeds), program_id)
            .map_err(|_| error!(SwitchboardError::PdaDeriveError))?;
        Ok((pubkey, seeds, bump.unwrap()))
    }
}
impl Default for PermissionAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}

impl BitAnd<switchboard_v2::SwitchboardPermission> for u32 {
    type Output = bool;
    fn bitand(self, rhs: SwitchboardPermission) -> bool {
        (self & rhs as u32) != 0u32
    }
}
