use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct OracleHeartbeat {
    pub address: Uuid,
}
impl Action for OracleHeartbeat {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let oracle = ctx.oracles.get(&self.address).ok_or(Error::InvalidOracle)?;
        let queue = ctx.queues.get(&oracle.queue).unwrap();
        assert_authorized(&oracle)?;
        let permission = Permission::get(ctx, &queue.authority, &queue.address, &oracle.address)
            .ok_or(Error::InvalidPermission)?;
        require(
            permission.has(SwitchboardPermission::PermitOracleHeartbeat),
            Error::PermissionDenied,
        )?;
        // TODO: check stake

        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut oracle = ctx.oracles.get(&self.address).unwrap();
        let mut queue = ctx.queues.get(&oracle.queue).unwrap();
        oracle.last_heartbeat = now_seconds();
        if oracle.num_in_use == 0 {
            queue.data.push(&self.address);
            oracle.num_in_use += 1;
        }
        ctx.oracles.insert(&self.address, &oracle);
        queue.garbage_collect(ctx);
        ctx.queues.insert(&oracle.queue, &queue);
        Ok(())
    }
}
