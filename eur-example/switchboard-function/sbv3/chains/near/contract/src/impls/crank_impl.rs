use crate::*;
use std::convert::TryInto;

#[derive(BorshDeserialize, BorshSerialize)]
pub struct Crank {
    pub address: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub queue: Uuid,
    pub max_rows: u64,
    pub jitter_modifier: u8,
    pub data: Vector<CrankRow>,
    pub creation_timestamp: u64,
    pub _ebuf: Vec<u8>,
    pub features: Vec<u8>,
}

#[derive(Default, Copy, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct CrankRow {
    pub uuid: Uuid,
    pub next_timestamp: u64,
}

impl Crank {
    pub fn len(&self) -> u32 {
        self.data.len().try_into().unwrap()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    pub fn push(&mut self, row: CrankRow) -> Result<(), Error> {
        // Check to make sure the priority queue isn't full
        if self.data.len() == self.max_rows {
            // msg!("Crank appears to be at max capacity");
            return Error::CrankMaxCapacity.into();
        }

        let mut current = self.data.len();

        self.data.push(&row);

        while current != 0
            && self.data.get(current).unwrap().next_timestamp
                < self.data.get(parent(current)).unwrap().next_timestamp
        {
            let parent = parent(current);
            swap(&mut self.data, current, parent);
            current = parent;
        }
        Ok(())
    }

    pub fn peak(&self, pop_idx: u64) -> Result<CrankRow, Error> {
        let pq_data = &self.data;
        if pq_data.len() <= pop_idx {
            return Error::CrankEmptyError.into();
        }
        Ok(pq_data.get(pop_idx).unwrap())
    }

    pub fn pop(&mut self, pop_idx: u64) -> Result<Uuid, Error> {
        let popped_key = self.peak(pop_idx)?.uuid;

        // move the tail to the head
        self.data
            .replace(pop_idx, &self.data.get(self.data.len() - 1).unwrap());

        // clear the tail
        self.data.pop();

        //re-heapify the tree
        let mut current = pop_idx;
        loop {
            let mut idx = right_child(current);
            let left_idx = left_child(current);
            if idx >= self.data.len() {
                idx = left_idx;
            } else if self.data.get(idx).unwrap().next_timestamp
                > self.data.get(left_idx).unwrap().next_timestamp
            {
                idx = left_idx;
            }
            if idx >= self.data.len() {
                break;
            }
            if self.data.get(current).unwrap().next_timestamp
                < self.data.get(idx).unwrap().next_timestamp
            {
                break;
            }
            swap(&mut self.data, current, idx);
            current = idx;
        }
        Ok(popped_key)
    }
}

fn parent(index: u64) -> u64 {
    match index {
        0 => 0,
        _ => (index - 1) / 2,
    }
}

fn left_child(num: u64) -> u64 {
    (num * 2) + 1
}

fn right_child(num: u64) -> u64 {
    (num * 2) + 2
}

fn swap(buf: &mut Vector<CrankRow>, i1: u64, i2: u64) {
    let el1 = buf.get(i1).unwrap();
    buf.replace(i1, &buf.get(i2).unwrap());
    buf.replace(i2, &el1);
}
