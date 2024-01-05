use sb_util::span::StoreSpan;
use starknet::ContractAddress;

#[derive(Copy, Drop, PartialEq, Serde, starknet::Store)]
enum FunctionStatus {
    #[default]
    None,
    Active,
    NonExecutable,
    Expired,
    OutOfFunds,
    InvalidPermissions,
    Deactivated,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
struct FunctionConfig {
    // The registry in which the specified container can be located.
    container_registry: felt252,
    // The name of the container to run.
    container: Span<felt252>,
    // The version of the container to run.
    version: felt252,
    // The measurements that are allowed to submit results to this function.
    mr_enclaves: Span<u256>,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
struct FunctionState {
    // The number of times that this function's execution has failed consecutively.
    consecutive_failures: felt252,
    // The timestamp that this function was last executed at.
    last_execution_timestamp: u64,
    // The gas cost of the last execution of this function.
    last_execution_gas_cost: felt252,
    // The first time this function was triggered.
    triggered_since: felt252,
    // Number of times this function has been triggered.
    triggered_count: felt252,
    // Whether this function is currently in a 'triggered' state or not.
    triggered: bool,
    queue_idx: felt252,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
struct Function {
    id: felt252,
    name: felt252,
    authority: ContractAddress,
    verifier_id: felt252,
    attestation_queue_id: felt252,
    created_at: u64,
    updated_at: u64,
    status: FunctionStatus,
    config: FunctionConfig,
    state: FunctionState,
}

#[derive(Copy, Drop, Serde)]
struct FunctionCreateParams {
    name: felt252,
    authority: ContractAddress,
    attestation_queue_id: felt252,
    container_registry: felt252,
    container: Span<felt252>,
    version: felt252,
    mr_enclaves: Span<u256>,
}

#[derive(Copy, Drop, Serde)]
struct FunctionUpdateParams {
    id: felt252,
    name: felt252,
    authority: ContractAddress,
    container_registry: felt252,
    container: Span<felt252>,
    version: felt252,
    mr_enclaves: Span<u256>,
}

#[derive(Copy, Drop, Serde)]
struct FunctionVerifyParams {}
