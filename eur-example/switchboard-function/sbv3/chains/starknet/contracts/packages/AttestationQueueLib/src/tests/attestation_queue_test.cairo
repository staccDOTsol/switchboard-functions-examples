// use starknet::contract_address::ContractAddressPartialEq;
// use super::test_utils;
use sb_attestation_queue::attestation_queue::AttestationQueueCreateParams;
use sb_attestation_queue::attestation_queue::AttestationQueueSetPermissionParams;
use sb_attestation_queue::attestation_queue::AttestationQueueUpdateParams;
use sb_permissions::permissions::Permission;
use sb_util::toContractAddress;
// use snforge_std::get_class_hash;
use snforge_std::start_prank;
use snforge_std::start_warp;
use snforge_std::test_address;

#[starknet::contract]
mod TestContract {
    use sb_attestation_queue::attestation_queue_lib;
    use sb_permissions::permissions_lib;
    use sb_util::component::util_lib;

    component!(
        path: attestation_queue_lib,
        storage: attestation_queue_storage,
        event: AttestationQueueEvent
    );
    component!(path: util_lib, storage: util_storage, event: UtilEvent);
    component!(path: permissions_lib, storage: permissions_storage, event: PermissionsEvent);


    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        AttestationQueueEvent: attestation_queue_lib::Event,
        PermissionsEvent: permissions_lib::Event,
        UtilEvent: util_lib::Event,
    }

    #[storage]
    struct Storage {
        #[substorage(v0)]
        attestation_queue_storage: attestation_queue_lib::Storage,
        #[substorage(v0)]
        permissions_storage: permissions_lib::Storage,
        #[substorage(v0)]
        util_storage: util_lib::Storage,
    }

    impl AttestationQueueLib = attestation_queue_lib::AttestationQueueLib<ContractState>;
    impl AttestationQueueLibExternal =
        attestation_queue_lib::AttestationQueueExternalImpl<ContractState>;
}

#[test]
#[available_gas(9999999)]
#[should_panic(expected: ('AttestationQueueNotFound',))]
fn bad_get_attestation_queue() {
    let mut state = TestContract::contract_state_for_testing();
    let queue = TestContract::AttestationQueueLibExternal::attestation_queue_get(@state, 123);
}
#[test]
#[available_gas(9999999)]
fn attestation_queue_create_and_update() {
    let contract_address = test_address();
    let mut state = TestContract::contract_state_for_testing();
    start_warp(contract_address, 1000);

    let params = AttestationQueueCreateParams {
        authority: toContractAddress('iamjack.sol'),
        allow_authority_overide_after: 10,
        require_heartbeat_permission: true,
        require_usage_permission: false,
        max_size: 3,
        max_verifier_verification_age: 23,
        max_consecutive_function_failures: 69,
        reward: 10000,
        verifier_timeout: 60,
    };
    // Grab the generated ID from the AttestationQueue object.
    let id = TestContract::AttestationQueueLibExternal::attestation_queue_create(ref state, params)
        .id;
    // Read the AttestationQueue via `get_attestation_queue`
    let queue = TestContract::AttestationQueueLibExternal::attestation_queue_get(@state, id);
    // Assert that the queue has been initialized properly
    assert(queue.id == id, '1-BadID');
    assert(queue.authority == params.authority, '1-BadAuthority');
    assert(queue.mr_enclaves.is_empty(), '1-BadMrEnclaves');
    assert(queue.verifiers.is_empty(), '1-BadVerifiers');
    assert(queue.created_at == 1000, '1-BadCreatedAt');
    assert(queue.updated_at == 1000, '1-BadUpdatedAt');
    assert(
        queue.allow_authority_overide_after == params.allow_authority_overide_after,
        '1-BadAllowAuthorityOverideAfter'
    );
    assert(
        queue.require_heartbeat_permission == params.require_heartbeat_permission,
        '1-BadRequireHeartbeatPermission'
    );
    assert(
        queue.require_usage_permission == params.require_usage_permission,
        '1-BadRequireUsagePermission'
    );
    assert(queue.max_size == params.max_size, '1-BadMaxSize');
    assert(
        queue.max_verifier_verification_age == params.max_verifier_verification_age,
        '1-BadMaxQuoteVerificationAge'
    );
    assert(
        queue.max_consecutive_function_failures == params.max_consecutive_function_failures,
        '1-BadMaxConsecutiveFuncFailures'
    );
    assert(queue.reward == params.reward, '1-BadReward');
    assert(queue.verifier_timeout == params.verifier_timeout, '1-BadVerifierTimeout');
    assert(queue.cur_idx == 0, '1-BadCurIdx');
    assert(queue.gc_idx == 0, '1-BadGcIdx');
    // Make sure that the caller is the function authority and update the spoofed block timestamp.
    start_prank(contract_address, params.authority);
    start_warp(contract_address, 2000);
    let params = AttestationQueueUpdateParams {
        id: queue.id,
        authority: toContractAddress('iamjack-69.sol'),
        allow_authority_overide_after: 40,
        require_heartbeat_permission: false,
        require_usage_permission: true,
        max_size: 5,
        max_verifier_verification_age: 19,
        max_consecutive_function_failures: 100,
        reward: 10101,
        verifier_timeout: 120,
    };
    // Trigger an update of AttestationQueue object.
    let queue = TestContract::AttestationQueueLibExternal::attestation_queue_update(
        ref state, params
    );
    // Assert that the queue has been initialized properly
    assert(queue.id == params.id, '2-BadID');
    assert(queue.authority == params.authority, '2-BadAuthority');
    assert(queue.created_at == 1000, '2-BadCreatedAt');
    assert(queue.updated_at == 2000, '2-BadUpdatedAt');
    assert(
        queue.allow_authority_overide_after == params.allow_authority_overide_after,
        '2-BadAllowAuthorityOverideAfter'
    );
    assert(
        queue.require_heartbeat_permission == params.require_heartbeat_permission,
        '2-BadRequireHeartbeatPermission'
    );
    assert(
        queue.require_usage_permission == params.require_usage_permission,
        '2-BadRequireUsagePermission'
    );
    assert(queue.max_size == params.max_size, '2-BadMaxSize');
    assert(
        queue.max_verifier_verification_age == params.max_verifier_verification_age,
        '2-BadMaxQuoteVerificationAge'
    );
    assert(
        queue.max_consecutive_function_failures == params.max_consecutive_function_failures,
        '2-BadMaxConsecutiveFuncFailures'
    );
    assert(queue.reward == params.reward, '2-BadReward');
    assert(queue.verifier_timeout == params.verifier_timeout, '2-BadVerifierTimeout');

    // Make sure the queue's authority is the caller.
    start_prank(contract_address, params.authority);
    // Turn on the usage permission.
    let permission = TestContract::AttestationQueueLibExternal::attestation_queue_set_permission(
        ref state,
        AttestationQueueSetPermissionParams {
            id: queue.id, grantee: 69, permission: Permission::Usage, on: true
        }
    );
    assert(permission == 2, '1-BadPermission');
    // Turn off the usage permission and expect all to be off.
    let permission = TestContract::AttestationQueueLibExternal::attestation_queue_set_permission(
        ref state,
        AttestationQueueSetPermissionParams {
            id: queue.id, grantee: 69, permission: Permission::Usage, on: false
        }
    );
    assert(permission == 0, '2-BadPermission');
}

