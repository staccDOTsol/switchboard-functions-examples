use sb_permissions::permissions::Permission;
use sb_util::span::StoreSpan;
use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
struct AttestationQueue {
    // An identifier at which this AttestationQueue can be found.
    id: felt252,
    // The address of the authority which is permitted to modify this AttestationQueue.
    authority: ContractAddress,
    // The measurements that are allowed to verify quotes. Effectively a way for the queue operator to choose what images can be run on this queue.
    mr_enclaves: Span<u256>,
    // The addresses of the quote verifiers who have a valid verification status and have heartbeated on-chain recently.
    verifiers: Span<felt252>,
    // The timestamp at which this AttestationQueue was created.
    created_at: u64,
    // The timestamp at which this AttestationQueue was last updated.
    updated_at: u64,
    // Allow authority to force add a node after X seconds with no heartbeat.
    allow_authority_overide_after: u64,
    // Even if a heartbeating machine quote verifies with proper measurement, require authority signoff.
    require_heartbeat_permission: bool,
    // Require Function accounts on this AttestationQueue to have proper permissions to be executed.
    require_usage_permission: bool,
    // The maximum number of verifiers that are allowed to be members of this queue.
    max_size: usize,
    // The maximum allowable time until an Verifier needs to be re-verified on-chain.
    max_verifier_verification_age: u64,
    // The maximum number of times that a function is allowed to fail consecutively before its blacklisted.
    max_consecutive_function_failures: u64,
    // The reward paid to quote verifiers for attesting on-chain.
    reward: u256,
    // The timestamp at which the queue was last heartbeated on.
    last_heartbeat: u64,
    // The number of seconds after which a verifier can be kicked off of of this AttestationQueue.
    verifier_timeout: u64,
    // Incrementer used to track the current quote verifier permitted to run any available functions.
    cur_idx: usize,
    // Incrementer used to garbage collect and remove stale quote verifiers.
    gc_idx: usize,
}

#[derive(Copy, Drop, Serde)]
struct AttestationQueueCreateParams {
    authority: ContractAddress,
    allow_authority_overide_after: u64,
    require_heartbeat_permission: bool,
    require_usage_permission: bool,
    max_size: usize,
    max_verifier_verification_age: u64,
    max_consecutive_function_failures: u64,
    reward: u256,
    verifier_timeout: u64,
}

#[derive(Copy, Drop, Serde)]
struct AttestationQueueUpdateParams {
    id: felt252,
    authority: ContractAddress,
    allow_authority_overide_after: u64,
    require_heartbeat_permission: bool,
    require_usage_permission: bool,
    max_size: usize,
    max_verifier_verification_age: u64,
    max_consecutive_function_failures: u64,
    reward: u256,
    verifier_timeout: u64,
}

#[derive(Copy, Drop, Serde)]
struct AttestationQueueAddMrEnclaveParams {
    id: felt252,
    mr_enclave: u256,
}

#[derive(Copy, Drop, Serde)]
struct AttestationQueueRemoveMrEnclaveParams {
    id: felt252,
    mr_enclave: u256,
}

#[derive(Copy, Drop, Serde)]
struct AttestationQueueSetPermissionParams {
    id: felt252,
    grantee: felt252,
    permission: Permission,
    on: bool,
}
