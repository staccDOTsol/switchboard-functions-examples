use crate::*;

#[account(zero_copy(unsafe))]
#[repr(packed)]
pub struct AttestationProgramState {
    pub bump: u8,
    pub _ebuf: [u8; 2048],
}


impl AttestationProgramState {
    pub fn size() -> usize {
        8 + std::mem::size_of::<AttestationProgramState>()
    }
}
