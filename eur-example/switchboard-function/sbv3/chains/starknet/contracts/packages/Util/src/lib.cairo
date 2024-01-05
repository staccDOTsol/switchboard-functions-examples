mod component;
mod math;
mod span;

#[cfg(test)]
mod tests;

use starknet::class_hash::{ClassHash, Felt252TryIntoClassHash};
use starknet::contract_address::{ContractAddress, Felt252TryIntoContractAddress};

/// Given an array of FieldElement's, produce a hash.
fn poseidon_hash(serialized: Array<felt252>) -> felt252 {
    return poseidon::poseidon_hash_span(serialized.span());
}

/// Given a FieldElement, produce a ContractAddress.
fn toContractAddress(address: felt252) -> ContractAddress {
    return Felt252TryIntoContractAddress::try_into(address).expect('InvalidContractAddress');
}

/// Given a FieldElement, produce a ClassHash.
fn toClassHash(address: felt252) -> ClassHash {
    return Felt252TryIntoClassHash::try_into(address).expect('InvalidClassHash');
}

mod guards {
    use super::ContractAddress;

    // Asserts that the `caller` is indeed the authority of a SB account.
    fn check_authority(authority: ContractAddress) {
        let caller = starknet::get_caller_address();
        assert(authority == caller, 'InvalidAuthority');
    }

    // Asserts that the current `balance` of a SB account is greater than the `amount` param.
    fn check_balance(balance: u256, amount: u256) {
        assert(balance >= amount, 'InsufficientBalance');
    }
}
