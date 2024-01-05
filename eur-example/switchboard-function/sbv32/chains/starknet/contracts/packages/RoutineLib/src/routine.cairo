use sb_function::function::FunctionStatus;
use sb_util::span::StoreSpan;
use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
struct Routine {
    // The identifier of this Routine.
    id: felt252,
    // The caller who is allowed to update the config of this Routine.
    authority: ContractAddress,
    // The timestamp of the creation of this Routine.
    created_at: u64,
    // The timestamp of the last time this Routine was updated.
    updated_at: u64,
    // The timestamp that this Routine was last executed at.
    last_executed_at: u64,
    // The encoded cron schedule at which this Routine will be executed.
    schedule: felt252,
    // The ID of the Function that this Routine is related to.
    function_id: felt252,
    // The serialized parameters that are provided to the Function on execution.
    params: Span<felt252>,
    // The number of times that this Routine's execution has failed consecutively.
    consecutive_failures: felt252,
    // The balance held by this Routine.
    balance: u256,
    // The status of this Routine.
    status: FunctionStatus,
    // The status of this Routine.
    errorCode: u8,
}


#[derive(Copy, Drop, Serde)]
struct RoutineCreateParams {
    authority: ContractAddress,
    function_id: felt252,
    params: Span<felt252>,
    schedule: felt252,
}

#[derive(Copy, Drop, Serde)]
struct RoutineUpdateParams {
    id: felt252,
    authority: ContractAddress,
    function_id: felt252,
    params: Span<felt252>,
    schedule: felt252,
}
