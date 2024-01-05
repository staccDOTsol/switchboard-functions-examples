pub mod view_crank;
pub use view_crank::*;

use crate::*;

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct CrankView {
    pub address: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub queue: Uuid,
    pub max_rows: u64,
    pub jitter_modifier: u8,
    pub data: Vec<CrankRow>,
}

impl Into<CrankView> for Crank {
    fn into(self) -> CrankView {
        CrankView {
            address: self.address,
            name: self.name,
            metadata: self.metadata,
            queue: self.queue,
            max_rows: self.max_rows,
            jitter_modifier: self.jitter_modifier,
            data: self.data.to_vec(),
        }
    }
}
