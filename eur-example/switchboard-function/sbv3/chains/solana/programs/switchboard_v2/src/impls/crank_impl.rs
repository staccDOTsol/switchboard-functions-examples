use crate::SwitchboardError;
use crate::*;
use bytemuck::try_cast_slice_mut;

fn parent(index: usize) -> usize {
    match index {
        0 => 0,
        _ => (index - 1) / 2,
    }
}

fn left_child(num: usize) -> usize {
    (num * 2) + 1
}

fn right_child(num: usize) -> usize {
    (num * 2) + 2
}

impl CrankAccountData {
    pub fn size() -> usize {
        std::mem::size_of::<CrankAccountData>() + 8
    }

    pub fn convert_buffer(buf: &mut [u8]) -> &mut [CrankRow] {
        try_cast_slice_mut(&mut buf[8..]).unwrap()
    }

    pub fn len(&self) -> u32 {
        self.pq_size
    }

    pub fn is_empty(&self) -> bool {
        self.pq_size == 0
    }

    pub fn push(&mut self, pq_data: &mut [CrankRow], row: CrankRow) -> Result<()> {
        // Check to make sure the priority queue isn't full
        if self.pq_size == self.max_rows {
            msg!("Crank appears to be at max capacity");
            return Err(error!(SwitchboardError::CrankMaxCapacityError));
        }

        let mut current = self.pq_size as usize;

        pq_data[current] = row;
        self.pq_size += 1;

        while current != 0
            && pq_data[current].next_timestamp < pq_data[parent(current)].next_timestamp
        {
            let parent = parent(current);
            pq_data.swap(current, parent);
            current = parent;
        }
        Ok(())
    }

    pub fn peak(&mut self, pq_data: &mut [CrankRow], pop_idx: usize) -> Result<CrankRow> {
        if self.pq_size < pop_idx.try_into().unwrap() {
            // TODO: change error msg
            return Err(error!(SwitchboardError::CrankEmptyError));
        }
        // retrieve the head of the heap
        Ok(pq_data[pop_idx])
    }

    pub fn pop(&mut self, pq_data: &mut [CrankRow], pop_idx: usize) -> Result<Pubkey> {
        let popped_key = self.peak(pq_data, pop_idx)?.pubkey;

        // move the tail to the head
        pq_data[pop_idx] = pq_data[self.pq_size as usize - 1];

        // clear the tail
        pq_data[self.pq_size as usize - 1] = CrankRow::default();
        self.pq_size -= 1;

        //re-heapify the tree
        let mut current = pop_idx;
        loop {
            let mut idx = right_child(current);
            let left_idx = left_child(current);
            if idx >= self.pq_size as usize
                || pq_data[idx].next_timestamp > pq_data[left_idx].next_timestamp
            {
                idx = left_idx;
            }
            if idx >= self.pq_size as usize {
                break;
            }
            if pq_data[current].next_timestamp < pq_data[idx].next_timestamp {
                break;
            }
            pq_data.swap(current, idx);
            current = idx;
        }
        Ok(popped_key)
    }
}
impl Default for CrankAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}
