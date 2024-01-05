use crate::*;
use near_sdk::Gas;

pub trait Managed {
    fn authority(&self) -> String;
}
pub fn assert_authorized(obj: &dyn Managed) -> Result<(), Error> {
    if obj.authority().as_str() != env::signer_account_id().as_str() {
        return Error::InvalidAuthority.into();
    }
    Ok(())
}

pub fn now_seconds() -> u64 {
    near_sdk::env::block_timestamp_ms() / 1000
}

pub fn shrink_to(mut buf: Vec<u8>, len: u32) -> Vec<u8> {
    buf.shrink_to(len.try_into().unwrap());
    buf
}

pub fn require(requirement: bool, err: Error) -> Result<(), Error> {
    if !requirement {
        return err.into();
    }
    Ok(())
}

pub fn remaining_gas() -> Gas {
    Gas(near_sdk::env::prepaid_gas().0 - near_sdk::env::used_gas().0)
}

pub fn is_promise() -> bool {
    near_sdk::env::predecessor_account_id() != near_sdk::env::signer_account_id()
}
