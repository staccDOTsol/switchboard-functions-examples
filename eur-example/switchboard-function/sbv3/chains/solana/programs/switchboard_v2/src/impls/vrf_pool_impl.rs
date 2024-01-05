use crate::*;
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use bytemuck::{Pod, Zeroable};

// LAYOUT
// 000 - 008: Discriminator
// 008 - 040: Authority Pubkey
// 040 - 072: Queue Pubkey
// 072 - 104: Escrow Pubkey
// 104 - 108: Min Interval
// 108 - 112: Max Rows
// 112 - 116: Size
// 116 - 120: IDX
// 120 - 121: State Bump
// 121 - 256: _ebuf
// 256 -  N : Pool

pub struct VrfPool<'a> {
    pub data: &'a mut [u8],
}

impl<'a> VrfPool<'a> {
    pub fn new(data: &'a mut [u8]) -> anchor_lang::Result<VrfPool<'a>> {
        if data.len() < VrfPoolAccountData::discriminator().len() {
            return Err(ErrorCode::AccountDiscriminatorNotFound.into());
        }

        let mut disc_bytes = [0u8; 8];
        disc_bytes.copy_from_slice(&data[..8]);
        if disc_bytes != VrfPoolAccountData::discriminator() {
            return Err(ErrorCode::AccountDiscriminatorMismatch.into());
        }

        Ok(VrfPool { data })
    }

    pub fn authority(&self) -> Pubkey {
        Pubkey::try_from_slice(&self.data[8..40]).unwrap()
    }

    pub fn queue(&self) -> Pubkey {
        Pubkey::try_from_slice(&self.data[40..72]).unwrap()
    }

    pub fn escrow(&self) -> Pubkey {
        Pubkey::try_from_slice(&self.data[72..104]).unwrap()
    }

    pub fn state_bump(&self) -> u8 {
        self.data[120]
    }

    pub fn min_interval(&self) -> u32 {
        let mut bytes: [u8; 4] = [0u8; 4];
        bytes.copy_from_slice(&self.data[104..108]);
        u32::from_le_bytes(bytes)
    }

    pub fn max_rows(&self) -> usize {
        let mut bytes: [u8; 4] = [0u8; 4];
        bytes.copy_from_slice(&self.data[108..112]);
        u32::from_le_bytes(bytes) as usize
    }

    pub fn size(&self) -> usize {
        let mut bytes: [u8; 4] = [0u8; 4];
        bytes.copy_from_slice(&self.data[112..116]);
        u32::from_le_bytes(bytes) as usize
    }

    pub fn set_size(&mut self, new_size: usize) {
        self.data[112..116].copy_from_slice(&(new_size as u32).to_le_bytes());
    }

    pub fn idx(&self) -> usize {
        let mut bytes: [u8; 4] = [0u8; 4];
        bytes.copy_from_slice(&self.data[116..120]);
        u32::from_le_bytes(bytes) as usize
    }

    pub fn set_idx(&mut self, new_idx: usize) {
        self.data[116..120].copy_from_slice(&(new_idx as u32).to_le_bytes());
    }

    pub fn pool(&self) -> &[VrfPoolRow] {
        bytemuck::try_cast_slice(&self.data[256..]).unwrap()
    }

    pub fn pool_mut(&mut self) -> &mut [VrfPoolRow] {
        bytemuck::try_cast_slice_mut(&mut self.data[256..]).unwrap()
    }

    pub fn pop(&mut self) -> Result<VrfPoolRow> {
        let size = self.size();
        if size == 0 {
            return Err(error!(SwitchboardError::VrfPoolEmpty));
        }

        let new_size = size - 1;

        self.set_size(new_size);

        let pool = self.pool_mut();
        let row = pool[new_size];
        pool[size - 1] = VrfPoolRow::default();

        let idx = self.idx();

        if new_size == 0 {
            self.set_idx(0);
        } else {
            self.set_idx(idx % (new_size))
        }

        Ok(row)
    }

    pub fn push(&mut self, pubkey: Pubkey) -> Result<()> {
        let size = self.size();
        if size == self.max_rows() {
            return Err(error!(SwitchboardError::VrfPoolFull));
        }

        let pool = self.pool_mut();
        pool[size] = VrfPoolRow {
            timestamp: 0,
            pubkey,
        };

        self.set_size(size + 1);
        self.set_idx(self.idx() % (size + 1));

        Ok(())
    }

    pub fn peak(&self) -> Result<VrfPoolRow> {
        let idx = self.idx();
        let size = self.size();
        if size == 0 {
            return Err(error!(SwitchboardError::VrfPoolEmpty));
        }

        let pool = self.pool();
        Ok(pool[idx])
    }

    pub fn peak_at_idx(&self, idx: usize) -> Result<VrfPoolRow> {
        let size = self.size();
        if size == 0 {
            return Err(error!(SwitchboardError::VrfPoolEmpty));
        }
        if idx > size {
            return Err(error!(SwitchboardError::ArrayOperationError));
        }
        let pool = self.pool();
        Ok(pool[idx])
    }

    pub fn pop_at_idx(&mut self, idx: usize) -> Result<VrfPoolRow> {
        let size = self.size();
        if size == 0 {
            return Err(error!(SwitchboardError::VrfPoolEmpty));
        }
        if idx == size - 1 {
            return self.pop();
        }

        let popped_row = self.peak_at_idx(idx)?;
        let last_row_idx = size - 1;
        let last_row = self.peak_at_idx(last_row_idx)?;

        let pool = self.pool_mut();
        pool[last_row_idx] = VrfPoolRow::default();
        pool[idx] = last_row;

        self.set_size(last_row_idx);
        self.set_idx(self.idx() % self.size());

        Ok(popped_row)
    }

    pub fn get(&mut self, timestamp: i64) -> Result<VrfPoolRow> {
        let row = self.peak()?;
        let min_interval = self.min_interval();
        if min_interval > 0
            && row.timestamp > 0
            && timestamp < row.timestamp + (min_interval as i64)
        {
            return Err(error!(SwitchboardError::VrfPoolRequestTooSoon));
        }

        let idx = self.idx();
        let mut pool = self.pool_mut();
        pool[idx].timestamp = timestamp;

        msg!(
            "idx: {:?}, pubkey: {:?}, timestamp {:?}",
            idx,
            row.pubkey,
            { row.timestamp }
        );

        self.set_idx((idx + 1) % self.size());

        Ok(row)
    }
}

impl Default for VrfPoolAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}

unsafe impl Pod for VrfPoolRow {}
unsafe impl Zeroable for VrfPoolRow {}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use super::*;

    #[test]
    fn it_pushes_rows() -> Result<()> {
        let mut pool_bytes = [0u8; 456];
        pool_bytes[..8].copy_from_slice(&VrfPoolAccountData::discriminator());
        let mut vrf_pool = VrfPool::new(&mut pool_bytes)?;
        vrf_pool.data[108..112].copy_from_slice(&5_u32.to_le_bytes()); // set max rows to 5

        assert_eq!(vrf_pool.idx(), 0);
        assert_eq!(vrf_pool.size(), 0);

        let pubkey_1 = Pubkey::from_str("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR")
            .map_err(|_| error!(SwitchboardError::PdaDeriveError))?;
        let pubkey_2 = Pubkey::from_str("8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee")
            .map_err(|_| error!(SwitchboardError::PdaDeriveError))?;
        let pubkey_3 = Pubkey::from_str("HNStfhaLnqwF2ZtJUizaA9uHDAVB976r2AgTUx9LrdEo")
            .map_err(|_| error!(SwitchboardError::PdaDeriveError))?;

        vrf_pool.push(pubkey_1)?;
        assert_eq!(vrf_pool.idx(), 0);
        assert_eq!(vrf_pool.size(), 1);

        vrf_pool.push(pubkey_2)?;
        assert_eq!(vrf_pool.idx(), 0);
        assert_eq!(vrf_pool.size(), 2);

        // GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR <-- idx
        // 8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee

        let popped_row_1 = vrf_pool.get(1)?;
        assert_eq!(vrf_pool.idx(), 1);
        assert_eq!(vrf_pool.size(), 2);
        assert_eq!(popped_row_1.pubkey, pubkey_1);

        // GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR
        // 8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee <-- idx

        let popped_row_2 = vrf_pool.get(1)?;
        assert_eq!(vrf_pool.idx(), 0);
        assert_eq!(vrf_pool.size(), 2);
        assert_eq!(popped_row_2.pubkey, pubkey_2);

        // GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR <-- idx
        // 8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee

        let popped_row_3 = vrf_pool.get(2)?;
        assert_eq!(vrf_pool.idx(), 1);
        assert_eq!(vrf_pool.size(), 2);
        assert_eq!(popped_row_3.pubkey, pubkey_1);

        // GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR
        // 8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee <-- idx

        vrf_pool.push(pubkey_3)?;
        assert_eq!(vrf_pool.idx(), 1);
        assert_eq!(vrf_pool.size(), 3);

        // GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR
        // 8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee <-- idx
        // HNStfhaLnqwF2ZtJUizaA9uHDAVB976r2AgTUx9LrdEo

        let popped_row_4 = vrf_pool.get(4)?;
        assert_eq!(vrf_pool.idx(), 2);
        assert_eq!(vrf_pool.size(), 3);
        assert_eq!(popped_row_4.pubkey, pubkey_2);

        // GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR
        // 8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee
        // HNStfhaLnqwF2ZtJUizaA9uHDAVB976r2AgTUx9LrdEo <-- idx

        let popped_row_by_idx = vrf_pool.pop_at_idx(0)?;
        assert_eq!(vrf_pool.idx(), 0);
        assert_eq!(vrf_pool.size(), 2);
        assert_eq!(popped_row_by_idx.pubkey, pubkey_1);
        let row_at_idx2 = vrf_pool.peak_at_idx(2)?;
        assert_eq!(row_at_idx2.pubkey, Pubkey::default());
        let row_at_idx0 = vrf_pool.peak_at_idx(0)?;
        assert_eq!(row_at_idx0.pubkey, pubkey_3);

        // HNStfhaLnqwF2ZtJUizaA9uHDAVB976r2AgTUx9LrdEo  <-- idx (swapped)
        // 8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee

        let popped_row_5 = vrf_pool.get(4)?;
        assert_eq!(vrf_pool.idx(), 1);
        assert_eq!(vrf_pool.size(), 2);
        assert_eq!(popped_row_5.pubkey, pubkey_3);

        // HNStfhaLnqwF2ZtJUizaA9uHDAVB976r2AgTUx9LrdEo
        // 8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee <-- idx

        Ok(())
    }
}
