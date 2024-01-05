use crate::*;

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct Job {
    pub address: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub authority: String,
    pub expiration: u64,
    pub hash: [u8; 32],
    pub data: Vec<u8>,
    pub reference_count: u32,
    pub total_spent: u64,
    pub created_at: u64,
    // pub variables: Vec<[u8;16]>,
    pub _ebuf: Vec<u8>,
    pub features: Vec<u8>,
}
impl Managed for Job {
    fn authority(&self) -> String {
        self.authority.clone()
    }
}
