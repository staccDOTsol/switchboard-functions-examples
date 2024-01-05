#[derive(Copy, Drop, Serde)]
struct Update {}

#[derive(Copy, Drop, Serde)]
struct Feed {}

#[starknet::interface]
trait IReceiverLib<State> {}

#[starknet::interface]
trait IExternalReceiverLib<State> {}

#[starknet::component]
mod receiver_lib {
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        NewResult: NewResult,
        NewAdapter: NewAdapter,
        ReadEvent: ReadEvent,
    }


    #[derive(Drop, starknet::Event)]
    struct NewResult {
        feed_id: felt252,
        round_id: felt252,
        value: felt252,
        timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct NewAdapter {
        feed_id: felt252,
        adapter: felt252,
        sender: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct ReadEvent {
        feed_id: felt252,
        sender: felt252,
        value: felt252,
        timestamp: u64,
    }

    #[storage]
    struct Storage {
        // feed idx -> feed address
        // This is because using a span would limit is to 256 feeds in storage. Using this method is more scalable.
        feed_list: LegacyMap<felt252, felt252>,
        // feed hash -> feed description
        feeds: LegacyMap<felt252, super::Feed>,
        // latest timestamp
        latest_timestamp: u64,
    }

    impl ReceiverLib<
        TContractState, +HasComponent<TContractState>
    > of super::IReceiverLib<ComponentState<TContractState>> {}

    #[embeddable_as(ReceiverImpl)]
    impl ExternalReceiverLib<
        TContractState, +HasComponent<TContractState>
    > of super::IExternalReceiverLib<ComponentState<TContractState>> {}
}
