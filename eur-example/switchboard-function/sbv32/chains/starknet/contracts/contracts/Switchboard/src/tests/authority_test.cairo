use snforge_std::start_prank;
use switchboard_contract::contract::ICoreSwitchboardDispatcherTrait;
use switchboard_contract::tests::test_utils;

#[test]
#[available_gas(999999)]
fn authority() {
    let authority = sb_util::toContractAddress('GoodAuthority');
    // Initialize the contract with an authority.
    let (_, core_dispatcher) = test_utils::deploy_switchboard(authority);
    // Validate that the authority that has been set is the same.
    let authority2 = core_dispatcher.get_authority();
    assert(authority == authority2, 'IncorrectInitialAuthority');
}

#[test]
#[available_gas(9999999)]
#[should_panic(expected: ('SbAuthorityMismatchError',))]
fn bad_set_authority() {
    // Initialize the contract with an authority.
    let (address, core_dispatcher) = test_utils::deploy_switchboard(sb_util::toContractAddress(1));
    // Set the caller address
    start_prank(address, sb_util::toContractAddress(42069));
    // Try to set a new authority (the caller address is not set to the above).
    core_dispatcher.set_authority(sb_util::toContractAddress(22222));
}

#[test]
#[available_gas(999999)]
fn good_set_authority() {
    // Initialize the contract with an authority.
    let authority = sb_util::toContractAddress('iamjack.sol');
    // Initialize the contract with an authority.
    let (address, core_dispatcher) = test_utils::deploy_switchboard(authority);
    // Set the caller address
    start_prank(address, authority);
    // Set a new authority.
    let new_authority = sb_util::toContractAddress(42069);
    core_dispatcher.set_authority(new_authority);
    // Validate that the new authority has been set successfully.
    let sb_authority = core_dispatcher.get_authority();
    assert(new_authority == sb_authority, 'AuthorityMismatch');
}
