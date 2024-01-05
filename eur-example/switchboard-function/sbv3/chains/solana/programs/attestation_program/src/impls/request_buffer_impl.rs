// use crate::*;
// use anchor_lang::Discriminator;
// use bytemuck::{Pod, Zeroable};

// pub struct RequestBufferRowRaw<'a> {
//     pub data: &'a mut [u8],
// }
// impl<'a> RequestBufferRowRaw<'a> {
//     pub fn new(data: &'a mut [u8]) -> anchor_lang::prelude::Result<Self> {
//         if data.len() < 24 {
//             return Err(error!(SwitchboardError::IllegalExecuteAttempt));
//         }

//         Ok(RequestBufferRowRaw { data })
//     }

//     pub fn id(&self) -> u64 {
//         let mut bytes: [u8; 8] = [0u8; 8];
//         bytes.copy_from_slice(&self.data[0..8]);
//         u64::from_le_bytes(bytes)
//     }

//     pub fn request_timestamp(&self) -> i64 {
//         let mut bytes: [u8; 8] = [0u8; 8];
//         bytes.copy_from_slice(&self.data[8..16]);
//         i64::from_le_bytes(bytes)
//     }

//     pub fn settled_timestamp(&self) -> i64 {
//         let mut bytes: [u8; 8] = [0u8; 8];
//         bytes.copy_from_slice(&self.data[16..24]);
//         i64::from_le_bytes(bytes)
//     }

//     pub fn params(&self) -> Vec<u8> {
//         self.data[24..].to_vec()
//     }

//     pub fn add_row(&mut self, nonce: u64, params: &[u8]) -> Result<()> {
//         for b in &mut *self.data {
//             if *b != 0 {
//                 *b = Default::default();
//             }
//         }

//         self.data[0..8].copy_from_slice(&(nonce).to_le_bytes());
//         self.data[8..16].copy_from_slice(&(Clock::get()?.unix_timestamp).to_le_bytes());

//         self.data[24..].copy_from_slice(params);

//         Ok(())
//     }

//     pub fn settle_row(&mut self) -> Result<()> {
//         self.data[16..24].copy_from_slice(&(Clock::get()?.unix_timestamp).to_le_bytes());

//         Ok(())
//     }
// }

// #[zero_copy(unsafe)]
// #[repr(packed)]
// pub struct RequestBufferRow {
//     pub id: u64,
//     pub request_timestamp: i64,
//     pub settled_timestamp: i64,
//     // pub params: Vec<u8>,
// }
// impl RequestBufferRow {
//     pub fn size(row_params_len: u32) -> usize {
//         8 + 8 + 8 + row_params_len as usize
//     }

//     pub fn new(data: &mut [u8]) -> anchor_lang::prelude::Result<()> {
//         Ok(())
//     }
// }
// unsafe impl Pod for RequestBufferRow {}
// unsafe impl Zeroable for RequestBufferRow {}

// impl Default for RequestBufferRow {
//     fn default() -> Self {
//         Self {
//             id: 0,
//             request_timestamp: 0,
//             settled_timestamp: 0,
//             // params: vec![],
//         }
//     }
// }

// // LAYOUT
// // 000 - 008: Discriminator
// // 008 - 040: Authority Pubkey
// // 040 - 072: Function Pubkey
// // 072 - 104: Queue Pubkey
// // 104 - 105: is_disabled
// // 105 - 109: Min Interval
// // 109 - 117: Nonce
// // 117 - 121: Push IDX
// // 121 - 125: Pop IDX
// // 125 - 129: Row Params Len
// // 129 - 133: Max Rows
// // 133 - 256: _ebuf
// // 256 -  N : Pool

// // Maybe these should only be created by the function authority
// // TODO: find tweet toly mentioned where a nonce can be used as a mini txn bundle to enforce ordering
// #[account(zero_copy(unsafe))]
// #[repr(packed)]
// pub struct FunctionRequestBufferAccountData {
//     pub authority: Pubkey,
//     pub function: Pubkey,
//     pub attestation_queue: Pubkey,

//     /// Flag to disable the buffer and prevent new verification requests.
//     // idk if this is useful
//     pub is_disabled: ResourceLevel,

//     /// The minimum amount of time a request must sit on the buffer before being overwritten.
//     pub min_interval: u32,

//     // Execution
//     /// Used to increment the idx of the request on the buffer.
//     pub nonce: u64,
//     /// The idx to add rows to the buffer.
//     pub push_idx: u32,
//     /// The idx to remove/verify rows from the buffer.
//     pub pop_idx: u32,

//     /// The maximum length of parameters used for each row.
//     pub row_params_len: u32, // 256
//     /// The maximum number of rows in the buffer.
//     pub max_rows: u32, // 1024

//     pub _ebuf: [u8; 123],
// }
// impl Default for FunctionRequestBufferAccountData {
//     fn default() -> Self {
//         Self {
//             authority: Pubkey::default(),
//             function: Pubkey::default(),
//             attestation_queue: Pubkey::default(),
//             is_disabled: ResourceLevel::None,
//             min_interval: 0,
//             nonce: 0,
//             push_idx: 0,
//             pop_idx: 0,

//             row_params_len: 0,
//             max_rows: 0,
//             _ebuf: [0u8; 123],
//         }
//     }
// }

// impl FunctionRequestBufferAccountData {
//     pub fn size() -> usize {
//         std::mem::size_of::<FunctionRequestBufferAccountData>() + 8
//     }

//     pub fn space(row_params_len: u32, max_rows: u32) -> usize {
//         let base: usize = std::mem::size_of::<FunctionRequestBufferAccountData>();

//         let buffer = (max_rows * row_params_len) as usize;
//         8 + base + buffer
//     }
// }

// pub struct RequestBuffer<'a> {
//     pub data: &'a mut [u8],
// }
// impl<'a> RequestBuffer<'a> {
//     pub fn new(data: &'a mut [u8]) -> anchor_lang::Result<RequestBuffer<'a>> {
//         if data.len() < FunctionRequestBufferAccountData::discriminator().len() {
//             return Err(ErrorCode::AccountDiscriminatorNotFound.into());
//         }

//         let mut disc_bytes = [0u8; 8];
//         disc_bytes.copy_from_slice(&data[..8]);
//         if disc_bytes != FunctionRequestBufferAccountData::discriminator() {
//             return Err(ErrorCode::AccountDiscriminatorMismatch.into());
//         }

//         Ok(RequestBuffer { data })
//     }

//     pub fn authority(&self) -> Pubkey {
//         Pubkey::try_from_slice(&self.data[8..40]).unwrap()
//     }

//     pub fn function(&self) -> Pubkey {
//         Pubkey::try_from_slice(&self.data[40..72]).unwrap()
//     }

//     pub fn attestation_queue(&self) -> Pubkey {
//         Pubkey::try_from_slice(&self.data[72..104]).unwrap()
//     }

//     pub fn is_disabled(&self) -> ResourceLevel {
//         self.data[104].into()
//     }

//     pub fn max_rows(&self) -> u32 {
//         let mut bytes: [u8; 4] = [0u8; 4];
//         bytes.copy_from_slice(&self.data[129..133]);
//         u32::from_le_bytes(bytes)
//     }

//     pub fn row_params_len(&self) -> u32 {
//         let mut bytes: [u8; 4] = [0u8; 4];
//         bytes.copy_from_slice(&self.data[125..129]);
//         u32::from_le_bytes(bytes)
//     }

//     pub fn min_interval(&self) -> u32 {
//         let mut bytes: [u8; 4] = [0u8; 4];
//         bytes.copy_from_slice(&self.data[105..109]);
//         u32::from_le_bytes(bytes)
//     }

//     pub fn set_min_interval(&mut self, min_interval: u32) {
//         self.data[105..109].copy_from_slice(&(min_interval).to_le_bytes());
//     }

//     pub fn nonce(&self) -> u64 {
//         let mut bytes: [u8; 8] = [0u8; 8];
//         bytes.copy_from_slice(&self.data[109..117]);
//         u64::from_le_bytes(bytes)
//     }

//     pub fn push_idx(&self) -> u32 {
//         let mut bytes: [u8; 4] = [0u8; 4];
//         bytes.copy_from_slice(&self.data[117..121]);
//         u32::from_le_bytes(bytes)
//     }

//     pub fn set_push_idx(&mut self, push_idx: u32) {
//         self.data[117..121].copy_from_slice(&(push_idx).to_le_bytes());
//     }

//     pub fn pop_idx(&self) -> u32 {
//         let mut bytes: [u8; 4] = [0u8; 4];
//         bytes.copy_from_slice(&self.data[121..125]);
//         u32::from_le_bytes(bytes)
//     }

//     pub fn set_pop_idx(&mut self, pop_idx: u32) {
//         self.data[121..125].copy_from_slice(&(pop_idx).to_le_bytes());
//     }

//     fn offset(idx: u32, row_params_len: u32) -> usize {
//         (256 + (idx as usize * RequestBufferRow::size(row_params_len))) as usize
//     }

//     pub fn push(&mut self, params: &[u8]) -> Result<RequestBufferRowRaw> {
//         let nonce = self.nonce();
//         let min_interval = self.min_interval();
//         let row_params_len = self.row_params_len();
//         let idx = self.push_idx();

//         if params.len() > row_params_len as usize {
//             return Err(error!(SwitchboardError::IllegalExecuteAttempt));
//         }

//         let offset = Self::offset(idx, row_params_len);
//         let size = RequestBufferRow::size(row_params_len);
//         let ending_offset = offset + size;
//         let mut row = RequestBufferRowRaw::new(&mut self.data[offset..ending_offset])?;

//         let last_req_timestamp = row.request_timestamp();
//         if last_req_timestamp > 0
//             && Clock::get()?.unix_timestamp - last_req_timestamp < min_interval as i64
//         {
//             return Err(error!(SwitchboardError::IllegalExecuteAttempt));
//         }

//         // Update row
//         row.add_row(nonce, params)?;

//         Ok(row)
//     }

//     // pub fn pool(&self) -> &[RequestBufferRow] {
//     //     bytemuck::try_cast_slice(&self.data[256..]).unwrap()
//     // }

//     // pub fn pool_mut(&mut self) -> &mut [RequestBufferRow] {
//     //     bytemuck::try_cast_slice_mut(&mut self.data[256..]).unwrap()
//     // }

//     // pub fn pop(&mut self) -> Result<RequestBufferRow> {
//     //     let size = self.size();
//     //     if size == 0 {
//     //         return Err(error!(SwitchboardError::RequestBufferEmpty));
//     //     }

//     //     let new_size = size - 1;

//     //     self.set_size(new_size);

//     //     let pool = self.pool_mut();
//     //     let row = pool[new_size];
//     //     pool[size - 1] = RequestBufferRow::default();

//     //     let idx = self.idx();

//     //     if new_size == 0 {
//     //         self.set_idx(0);
//     //     } else {
//     //         self.set_idx(idx % (new_size))
//     //     }

//     //     Ok(row)
//     // }

//     // pub fn push(&mut self, pubkey: Pubkey) -> Result<()> {
//     //     let size = self.size();
//     //     if size == self.max_rows() {
//     //         return Err(error!(SwitchboardError::RequestBufferFull));
//     //     }

//     //     let pool = self.pool_mut();
//     //     pool[size] = RequestBufferRow {
//     //         timestamp: 0,
//     //         pubkey,
//     //     };

//     //     self.set_size(size + 1);
//     //     self.set_idx(self.idx() % (size + 1));

//     //     Ok(())
//     // }

//     // pub fn peak_at_idx(&self, idx: usize) -> Result<RequestBufferRow> {
//     //     let size = self.size();
//     //     if size == 0 {
//     //         return Err(error!(SwitchboardError::RequestBufferEmpty));
//     //     }
//     //     if idx > size {
//     //         return Err(error!(SwitchboardError::ArrayOperationError));
//     //     }
//     //     let pool = self.pool();
//     //     Ok(pool[idx])
//     // }

//     // pub fn pop_at_idx(&mut self, idx: usize) -> Result<RequestBufferRow> {
//     //     let size = self.size();
//     //     if size == 0 {
//     //         return Err(error!(SwitchboardError::RequestBufferEmpty));
//     //     }
//     //     if idx == size - 1 {
//     //         return self.pop();
//     //     }

//     //     let popped_row = self.peak_at_idx(idx)?;
//     //     let last_row_idx = size - 1;
//     //     let last_row = self.peak_at_idx(last_row_idx)?;

//     //     let pool = self.pool_mut();
//     //     pool[last_row_idx] = RequestBufferRow::default();
//     //     pool[idx] = last_row;

//     //     self.set_size(last_row_idx);
//     //     self.set_idx(self.idx() % self.size());

//     //     Ok(popped_row)
//     // }

//     // pub fn get(&mut self, timestamp: i64) -> Result<RequestBufferRow> {
//     //     let row = self.peak()?;
//     //     let min_interval = self.min_interval();
//     //     if min_interval > 0
//     //         && row.timestamp > 0
//     //         && timestamp < row.timestamp + (min_interval as i64)
//     //     {
//     //         return Err(error!(SwitchboardError::RequestBufferRequestTooSoon));
//     //     }

//     //     let idx = self.idx();
//     //     let mut pool = self.pool_mut();
//     //     pool[idx].timestamp = timestamp;

//     //     msg!(
//     //         "idx: {:?}, pubkey: {:?}, timestamp {:?}",
//     //         idx,
//     //         row.pubkey,
//     //         { row.timestamp }
//     //     );

//     //     self.set_idx((idx + 1) % self.size());

//     //     Ok(row)
//     // }
// }
