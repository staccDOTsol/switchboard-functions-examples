use sb_function::function::FunctionStatus;
use sb_util::span::StoreSpan;
use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
struct Request {
    // The identifier of this Request.
    id: felt252,
    // The caller who is allowed to update the config of this Request.
    authority: ContractAddress,
    // The timestamp of the creation of this Request.
    created_at: u64,
    // The timestamp of the last time this Request was updated.
    updated_at: u64,
    // The timestamp that this Request was last executed at.
    last_executed_at: u64,
    // Whether the Request completed it's last execution successfully.
    executed: bool,
    // The ID of the Function that this Request is related to.
    function_id: felt252,
    // The serialized parameters that are provided to the Function on execution.
    params: Span<felt252>,
    // The number of times that this Request's execution has failed consecutively.
    consecutive_failures: felt252,
    // The balance held by this Request.
    balance: u256,
    // The amount of delay to add to this Request when triggered.
    start_after: u64,
    // The status of this Request.
    status: FunctionStatus,
    // The status of this Request.
    errorCode: u8,
}

#[derive(Copy, Drop, Serde)]
struct RequestCreateParams {
    authority: ContractAddress,
    function_id: felt252,
    params: Span<felt252>,
    start_after: u64,
}

#[derive(Copy, Drop, Serde)]
struct RequestUpdateParams {
    id: felt252,
    authority: ContractAddress,
    function_id: felt252,
    params: Span<felt252>,
    start_after: u64,
}
