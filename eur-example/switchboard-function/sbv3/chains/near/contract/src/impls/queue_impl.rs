use crate::*;

// Sliding window queue
#[derive(BorshDeserialize, BorshSerialize)]
pub struct OracleQueue {
    pub address: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub authority: String,
    pub oracle_timeout: u32,
    pub reward: u128,
    pub min_stake: u128,
    pub slashing_enabled: bool,
    pub variance_tolerance_multiplier: SwitchboardDecimal,
    // Number of update rounds new feeds are on probation for.
    // If a feed returns 429s within probation period, auto disable permissions.
    pub feed_probation_period: u32,
    ////
    pub curr_idx: u64,
    pub gc_idx: u64, // Garbage collection index
    pub consecutive_feed_failure_limit: u64,
    pub consecutive_oracle_failure_limit: u64,
    pub unpermissioned_feeds_enabled: bool,
    pub unpermissioned_vrf_enabled: bool,
    pub curator_reward_cut: SwitchboardDecimal,
    // Prevent new leases from being funded n this queue.
    // Useful to turn down a queue for migrations, since authority is always immutable.
    pub lock_lease_funding: bool,
    pub mint: String,
    pub enable_buffer_relayers: bool,
    pub max_size: u32,
    pub data: Vector<Uuid>,
    pub max_gas_cost: u128, // 0 means no limit
    pub creation_timestamp: u64,
    pub _ebuf: Vec<u8>,
    pub features: Vec<u8>,
}

impl OracleQueue {
    pub fn len(&self) -> u64 {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.len() == 0
    }

    pub fn get_mint(&self) -> String {
        self.mint.clone()
    }

    pub fn max_round_rewards(&self, batch_size: u32) -> u128 {
        self.reward
            .checked_mul(batch_size.checked_add(1).unwrap().into())
            .unwrap()
    }

    pub fn next_n(&mut self, n: u32) -> Result<Vec<Uuid>, Error> {
        require(self.data.len() >= n.into(), Error::InsufficientQueueSize)?;
        let n = n as usize;
        let mut v = Vec::with_capacity(n);
        while v.len() != n {
            v.push(self.data.get(self.curr_idx).unwrap());
            self.curr_idx += 1;
            self.curr_idx %= self.data.len();
        }
        Ok(v)
    }

    pub fn garbage_collect(&mut self, ctx: &mut Contract) {
        if self.data.len() == 0 {
            return;
        }
        let gc_idx = self.gc_idx;
        let gc_oracle_key = self.data.get(gc_idx).unwrap();
        let mut gc_oracle = ctx.oracles.get(&gc_oracle_key).unwrap();
        self.gc_idx += 1;
        self.gc_idx %= self.data.len();
        if now_seconds().checked_sub(gc_oracle.last_heartbeat).unwrap() > self.oracle_timeout.into()
        {
            gc_oracle.num_in_use -= 1;
            self.data.swap_remove(gc_idx);
            self.curr_idx %= self.data.len();
            self.gc_idx %= self.data.len();
            ctx.oracles.insert(&gc_oracle_key, &gc_oracle);
            OracleBootedEvent {
                oracle: gc_oracle_key,
                queue: gc_oracle.queue,
                timestamp: now_seconds(),
            }
            .emit();
        }
    }
}
impl Managed for OracleQueue {
    fn authority(&self) -> String {
        self.authority.clone()
    }
}
