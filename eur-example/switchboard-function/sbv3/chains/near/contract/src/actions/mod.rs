pub mod aggregator;
pub mod crank;
pub mod escrow;
pub mod job;
pub mod oracle;
pub mod permission;
pub mod queue;
pub use aggregator::*;
pub use crank::*;
pub use escrow::*;
pub use job::*;
pub use oracle::*;
pub use permission::*;
pub use queue::*;

use crate::*;
use near_sdk::env;

pub trait Action {
    fn validate(&self, ctx: &Contract) -> Result<(), Error>;
    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error>;

    fn run(&self, ctx: &mut Contract) -> Promise {
        let pre_storage_usage = env::storage_usage();
        self.validate(ctx).unwrap();
        self.actuate(ctx).unwrap();
        let post_storage_usage = env::storage_usage();
        if post_storage_usage > pre_storage_usage {
            let new_storage_usage = post_storage_usage.checked_sub(pre_storage_usage).unwrap();
            let new_storage_cost = env::storage_byte_cost() * new_storage_usage as u128;
            require(
                env::attached_deposit() >= new_storage_cost,
                Error::InsufficientDeposit,
            )
            .unwrap();
            let refund = env::attached_deposit() - new_storage_cost;
            return Promise::new(env::predecessor_account_id()).transfer(refund);
        }
        Promise::new(env::predecessor_account_id())
    }
}
