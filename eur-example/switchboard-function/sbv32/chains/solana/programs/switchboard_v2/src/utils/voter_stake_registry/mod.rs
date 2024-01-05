use anchor_lang::prelude::*;
pub use deposit_entry::*;
pub use lockup::*;
pub use registrar::*;
use solana_program::pubkey;
pub use voter::*;
pub use voting_mint_config::*;

pub use static_assertions::const_assert;

mod deposit_entry;
mod lockup;
mod registrar;
mod voter;
mod voting_mint_config;

pub static VOTER_STAKE_REGISTRY_PID: Pubkey =
    pubkey!("4Q6WW2ouZ6V3iaNm56MTd5n2tnTm4C5fiH8miFHnAFHo");
