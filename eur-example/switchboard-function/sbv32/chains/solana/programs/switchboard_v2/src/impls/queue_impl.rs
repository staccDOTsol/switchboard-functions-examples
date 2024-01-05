use crate::SwitchboardError;
use crate::*;
use bytemuck::try_cast_slice_mut;

impl OracleQueueAccountData {
    pub fn size() -> usize {
        std::mem::size_of::<OracleQueueAccountData>() + 8
    }

    pub fn convert_buffer(buf: &mut [u8]) -> &mut [Pubkey] {
        try_cast_slice_mut(&mut buf[8..]).unwrap()
    }

    pub fn len(&self) -> u32 {
        self.size
    }

    pub fn is_empty(&self) -> bool {
        self.size == 0
    }

    pub fn get_mint(&self) -> Pubkey {
        if self.mint == Pubkey::default() {
            return anchor_spl::token::spl_token::native_mint::ID;
        }
        self.mint
    }

    pub fn max_round_rewards(&self, batch_size: u32) -> u64 {
        self.reward
            .checked_mul(batch_size.checked_add(1).unwrap().into())
            .unwrap()
    }

    pub fn next_n(&mut self, queue: &[Pubkey], n: u32) -> Result<Vec<Pubkey>> {
        if self.size < n {
            return Err(error!(SwitchboardError::InsufficientOracleQueueError));
        }
        let n = n as usize;
        let mut v = Vec::with_capacity(n);
        while v.len() != n {
            v.push(queue[self.curr_idx as usize]);
            self.curr_idx += 1;
            self.curr_idx %= self.size;
        }
        Ok(v)
    }

    pub fn try_garbage_collection(
        &mut self,
        queue: &mut [Pubkey],
        clock: &Clock,
        gc_oracle_loader: &AccountLoader<'_, OracleAccountData>,
    ) -> Result<()> {
        let gc_idx = self.gc_idx as usize;
        let mut gc_oracle = gc_oracle_loader.load_mut()?;
        let gc_oracle_pubkey = queue[gc_idx];
        if gc_oracle_pubkey != gc_oracle_loader.key() {
            msg!("Garbage collection index swapped. Skipping GC check.");
            emit!(GarbageCollectFailureEvent {
                queue_pubkey: gc_oracle.queue_pubkey
            });
            return Ok(());
        }
        self.gc_idx += 1;
        self.gc_idx %= self.size;
        if clock
            .unix_timestamp
            .checked_sub(gc_oracle.last_heartbeat)
            .unwrap()
            > self.oracle_timeout.into()
        {
            gc_oracle.num_in_use -= 1;
            self.size -= 1;
            queue.swap(gc_idx, self.size as usize);
            self.curr_idx %= self.size;
            self.gc_idx %= self.size;
            emit!(OracleBootedEvent {
                oracle_pubkey: gc_oracle_loader.key(),
                queue_pubkey: gc_oracle.queue_pubkey
            });
        }
        Ok(())
    }
}
impl Default for OracleQueueAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
