use crate::*;
use bytemuck::{try_cast_slice, try_cast_slice_mut, try_from_bytes, try_from_bytes_mut};

pub struct AggregatorHistoryAccountInfo<'a> {
    pub buf: &'a mut [u8],
}
impl<'a> AggregatorHistoryAccountInfo<'a> {
    pub fn insertion_idx(&self) -> u32 {
        let insertion_idx = try_from_bytes(&self.buf[8..12]).unwrap();
        *insertion_idx
    }

    pub fn set_insertion_idx(&mut self, val: u32) {
        let insertion_idx = try_from_bytes_mut(&mut self.buf[8..12]).unwrap();
        *insertion_idx = val;
    }

    pub fn buf_at(&self, idx: u32) -> AggregatorHistoryRow {
        let buf: &[AggregatorHistoryRow] = try_cast_slice(&self.buf[12..]).unwrap();
        buf[idx as usize]
    }

    pub fn set_buf_at(&mut self, idx: u32, val: AggregatorHistoryRow) {
        let buf: &mut [AggregatorHistoryRow] = try_cast_slice_mut(&mut self.buf[12..]).unwrap();
        buf[idx as usize] = val;
    }

    pub fn len(&self) -> u32 {
        let buf: &[AggregatorHistoryRow] = try_cast_slice(&self.buf[12..]).unwrap();
        buf.len().try_into().unwrap()
    }

    pub fn insert(&mut self, value: SwitchboardDecimal, timestamp: i64) {
        if self.len() == 0 {
            return;
        }
        // Get insertion index.
        let mut ins_idx = self.insertion_idx();
        // increment index if required. Dont increment if field is default or current
        // round timestamp matches.
        if self.buf_at(ins_idx).timestamp != 0 && self.buf_at(ins_idx).timestamp != timestamp
        //self.current_round.round_open_timestamp
        {
            ins_idx = (ins_idx + 1) % self.len();
            self.set_insertion_idx(ins_idx);
        }
        self.set_buf_at(ins_idx, AggregatorHistoryRow { value, timestamp });
    }
}
