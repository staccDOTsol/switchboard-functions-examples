use snforge_std::get_class_hash;
use snforge_std::start_prank;
use switchboard_contract::contract::ICoreSwitchboardDispatcherTrait;
use switchboard_contract::tests::test_utils;

#[test]
#[available_gas(9999999)]
#[should_panic(expected: ('ClassHashIsZeroError',))]
fn bad_set_implementation_1() {
    let authority = sb_util::toContractAddress('GoodAuthority');
    // Initialize the contract with an authority.
    let (address, core_dispatcher) = test_utils::deploy_switchboard(authority);
    // Set the caller address
    start_prank(address, authority);
    // We expect this test to fail because the ClassHash being set must be non-zero.
    core_dispatcher.set_class_hash(sb_util::toClassHash(0));
}

#[test]
#[available_gas(9999999)]
#[should_panic(expected: ('SbAuthorityMismatchError',))]
fn bad_set_implementation_2() {
    let authority = sb_util::toContractAddress('GoodUser');
    // Initialize the contract with an authority.
    let (address, core_dispatcher) = test_utils::deploy_switchboard(authority);
    // Set the caller address
    start_prank(address, sb_util::toContractAddress('EvilUser'));
    // We expect this test to fail because the wrong authority ('EvilUser') is trying to set the
    // implementation when the authority of the Switchboard contract is 'GoodUser'.
    core_dispatcher.set_class_hash(sb_util::toClassHash(22222));
}

#[test]
#[available_gas(999999)]
fn good_set_implementation() {
    let authority = sb_util::toContractAddress('GoodUser');
    // Initialize the contract with an authority.
    let (address, core_dispatcher) = test_utils::deploy_switchboard(authority);
    // Set the caller address
    start_prank(address, authority);
    // Declare a new mock contract to replace the current class hash.
    let class_hash = get_class_hash(address);
    // We expect this test to pass because the correct authority ('GoodUser') is setting the
    // implementation to a non-zero ClassHash
    core_dispatcher.set_class_hash(class_hash);
}

