use TestContract::addrsContractMemberStateTrait;
use TestContract::contactContractMemberStateTrait;
use TestContract::numbersContractMemberStateTrait;
use core::array::SpanTrait;
use sb_util::span::{SpanImplTrait, StoreSpan};
use sb_util::toContractAddress;
use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
struct Contact {
    name: felt252,
    favorite_numbers: Span<u256>,
}

#[starknet::contract]
mod TestContract {
    use super::Contact;
    use super::ContractAddress;
    use super::StoreSpan;

    #[storage]
    struct Storage {
        // to test a corelib type that has Store and Into<ContractAddress, felt252>
        addrs: Span<ContractAddress>,
        // to test a corelib compound struct
        numbers: Span<u256>,
        // to test a truct that has a Span inside of it
        contact: Contact,
    }
}

#[test]
#[available_gas(100000000)]
fn test_span_store_addresses() {
    // 1: Initial state.
    let mut state = TestContract::contract_state_for_testing();
    assert(state.addrs.read().is_empty(), '1-addrs: is-empty');

    // 2: First state update.
    let mut addrs = array![
        toContractAddress(0),
        toContractAddress(123),
        toContractAddress(456),
        toContractAddress(789),
    ];
    state.addrs.write(addrs.span());
    let new_state = state.addrs.read();
    assert(SpanTrait::len(new_state) == 4, '2-addrs: len != 4');
    assert(new_state == addrs.span(), '2-addrs: state != addrs');

    // 3: Pop the first 2 items and compare again
    addrs.pop_front();
    addrs.pop_front();
    state.addrs.write(addrs.span());
    let new_state = state.addrs.read();
    assert(SpanTrait::len(new_state) == 2, '3-addrs: len != 2');
    assert(SpanTrait::at(new_state, 0) == @toContractAddress(456), '3-addrs: state[0] incorrect');
    assert(SpanTrait::at(new_state, 1) == @toContractAddress(789), '3-addrs: state[1] incorrect');
}

#[test]
#[available_gas(100000000)]
fn test_span_store_numbers() {
    // 1: Initial state.
    let mut state = TestContract::contract_state_for_testing();
    assert(state.numbers.read().is_empty(), '1-numbers: is-empty');

    // 2: First state update.
    let mut numbers = array![0_u256, 123_u256, 456_u256, 789_u256,];
    state.numbers.write(numbers.span());
    let new_state = state.numbers.read();
    assert(SpanTrait::len(new_state) == 4, '2-numbers: len != 4');
    assert(new_state == numbers.span(), '2-numbers: state != numbers');

    // 3: Pop the first 2 items and compare again
    numbers.pop_front();
    numbers.pop_front();
    state.numbers.write(numbers.span());
    let new_state = state.numbers.read();
    assert(SpanTrait::len(new_state) == 2, '3-numbers: len != 2');
    assert(SpanTrait::at(new_state, 0) == @456_u256, '3-numbers: state[0] incorrect');
    assert(SpanTrait::at(new_state, 1) == @789_u256, '3-numbers: state[1] incorrect');
}

#[test]
#[available_gas(100000000)]
fn test_span_store_contact() {
    // 1: Initial state.
    let mut state = TestContract::contract_state_for_testing();
    assert(state.contact.read().favorite_numbers.is_empty(), '1-contact: is-empty');

    // 2: First state update.
    let mut numbers = array![0_u256, 123_u256, 456_u256, 789_u256,];
    state.contact.write(Contact { name: 'PersonName', favorite_numbers: numbers.span(), });
    let new_state = state.contact.read().favorite_numbers;
    assert(SpanTrait::len(new_state) == 4, '2-contact: len != 4');
    assert(new_state == numbers.span(), '2-contact: state != numbers');

    // 3: Pop the first 2 items and compare again
    numbers.pop_front();
    numbers.pop_front();
    state.contact.write(Contact { name: 'PersonName', favorite_numbers: numbers.span(), });
    let new_state = state.contact.read().favorite_numbers;
    assert(SpanTrait::len(new_state) == 2, '3: len != 2');
    assert(SpanTrait::at(new_state, 0) == @456_u256, '3: state[0] incorrect');
    assert(SpanTrait::at(new_state, 1) == @789_u256, '3: state[1] incorrect');
}


#[test]
#[available_gas(2000000)]
fn filter_multiple() {
    let source = array![2, 1, 2, 3, 2];
    let result = source.span().filter(2);
    assert(result.len() == 2, 'result.len != 2');
    assert(result == array![1, 3].span(), 'result != [1,3]');
}

#[test]
#[available_gas(2000000)]
fn filter_doesnt_exist() {
    let source = array![1, 2, 3];
    let result = source.span().filter(4);
    assert(result.len() == 3, 'result.len != 3');
    assert(result == array![1, 2, 3].span(), 'result != [1,2,3]');
}
