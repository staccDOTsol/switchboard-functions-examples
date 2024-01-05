use crate::*;

impl JobAccountData {
    pub fn is_ready(&self) -> bool {
        self.is_initializing == 0
    }

    pub fn set_initial_status(&mut self, size: u32) -> Result<()> {
        self.data = vec![0; size as usize];
        let num_chunks = (size / 800) + 1;
        self.is_initializing = u8::MAX << num_chunks;
        Ok(())
    }

    pub fn load_chunk(&mut self, chunk_idx: u8, chunk: &Vec<u8>) -> Result<()> {
        let idx = (u32::from(chunk_idx) * 800) as usize;
        let _ = &self.data[idx..(idx + chunk.len())].copy_from_slice(chunk);

        // 11111101 | 00000010 = 11111111
        // 11110000 | 00000100 = 11110100
        self.is_initializing |= 1 << chunk_idx;

        Ok(())
    }
}
