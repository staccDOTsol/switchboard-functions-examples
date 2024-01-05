module switchboard::events {
    use switchboard_std::math::{SwitchboardDecimal};
    use sui::event;

    friend switchboard::aggregator_init_action;
    friend switchboard::aggregator_save_result_action;
    friend switchboard::aggregator_open_interval_action;
    friend switchboard::aggregator_set_configs_action;
    friend switchboard::aggregator_escrow_deposit_action;
    friend switchboard::aggregator_escrow_withdraw_action;
    friend switchboard::create_feed_action;
    friend switchboard::oracle_escrow_withdraw_action;
    friend switchboard::oracle_heartbeat_action;
    friend switchboard::aggregator_fast_save_result_action;
    friend switchboard::node_heartbeat_action;
    friend switchboard::quote_update_action;
    friend switchboard::quote_init_action;
    friend switchboard::oracle_token_withdraw_action;

    struct AggregatorInitEvent has copy, drop, store {
        aggregator_address: address,
    }
    
    struct AggregatorUpdateEvent has copy, drop, store {
        aggregator_address: address,
        old_value: SwitchboardDecimal,
        new_value: SwitchboardDecimal,
    }

    struct AggregatorResultEvent has copy, drop, store {
        aggregator_address: address,
        result_address: address,
    }

    struct AggregatorFastUpdateEvent has copy, drop, store {
        aggregator_address: address,
        aggregator_token_address: address,
        old_value: SwitchboardDecimal,
        new_value: SwitchboardDecimal,
        result_address: address,
    }

    struct AggregatorSaveResultEvent has copy, drop, store {
        aggregator_address: address,
        oracle_key: address,
        value: SwitchboardDecimal,
    }

    struct AggregatorOpenIntervalEvent has copy, drop, store {
        aggregator_address: address,
        queue_address: address,
    }

    struct AggregatorCrankEvictionEvent has copy, drop, store {
        aggregator_address: address,
        queue_address: address,
    }

    struct OracleRewardEvent has copy, drop, store {
        aggregator_address: address,
        oracle_address: address,
        amount: u64,
    }

    struct OracleEscrowWithdrawEvent has copy, drop, store {
        oracle_address: address,
        destination_address: address,
        amount: u64,
    }

    struct AggregatorEscrowWithdrawEvent has copy, drop, store {
        aggregator_address: address,
        destination_address: address,
        previous_amount: u64,
        new_amount: u64,
    }

    struct AggregatorEscrowFundEvent has copy, drop, store {
        aggregator_address: address,
        funder: address,
        amount: u64,
    }

    struct OracleBootedEvent has copy, drop, store {
        queue_address: address,
        oracle_address: address,
    }

    struct OraclePointerUpdateEvent has copy, drop, store {
        queue_address: address,
        oracle_idx: u64
    }

    struct QuoteVerifyRequestEvent has copy, drop, store {
        quote: address,
        verifier: address,
        verifiee: address,
    }

    struct QueueSendRequestEvent has copy, drop, store {
        queue: address,
        requster: address,
        receiver: address,
        x25519_encrypted_data: vector<u8>,
        decrypt_hash: vector<u8>,
    }

    struct NodeBootedEvent has copy, drop, store {
        queue_address: address,
        node_address: address,
    }

    public(friend) fun emit_aggregator_init_event(aggregator_address: address) {
        event::emit(AggregatorInitEvent {
            aggregator_address,
        })
    }

    public(friend) fun emit_aggregator_update_event(
        aggregator_address: address, 
        old_value: SwitchboardDecimal, 
        new_value: SwitchboardDecimal
    ) {
        event::emit(AggregatorUpdateEvent {
            aggregator_address,
            old_value,
            new_value
        })
    }

    public(friend) fun emit_aggregator_result_event(
        aggregator_address: address,
        result_address: address,
    ) {
        event::emit(AggregatorResultEvent {
            aggregator_address,
            result_address,
        })
    }

    public(friend) fun emit_aggregator_save_result_event(
        aggregator_address: address, 
        oracle_key: address, 
        value: SwitchboardDecimal
    ) {
        event::emit(AggregatorSaveResultEvent {
            aggregator_address,
            oracle_key,
            value,
        });
    }

    public(friend) fun emit_aggregator_open_interval_event(
        aggregator_address: address, 
        queue_address: address, 
    ) {
        event::emit(AggregatorOpenIntervalEvent {
            aggregator_address,
            queue_address,
        });
    }

    public(friend) fun emit_aggregator_crank_eviction_event(
        aggregator_address: address,
        queue_address: address,
    ) {
        event::emit(AggregatorCrankEvictionEvent {
            aggregator_address,
            queue_address,
        });
    }

    public(friend) fun emit_oracle_reward_event(
        aggregator_address: address,
        oracle_address: address,
        amount: u64,
    ) {
        event::emit(OracleRewardEvent {
            aggregator_address,
            oracle_address,
            amount,
        });
    }

    public(friend) fun emit_oracle_withdraw_event(
        oracle_address: address,
        destination_address: address,
        amount: u64,
    ) {
        event::emit(OracleEscrowWithdrawEvent {
            oracle_address,
            destination_address,
            amount,
        });
    }

    public(friend) fun emit_aggregator_escrow_withdraw_event(
        aggregator_address: address,
        destination_address: address,
        previous_amount: u64,
        new_amount: u64,
    ) {
        event::emit(AggregatorEscrowWithdrawEvent {
            aggregator_address,
            destination_address,
            previous_amount,
            new_amount,
        });
    }

    public(friend) fun emit_aggregator_escrow_fund_event(
        aggregator_address: address,
        funder: address,
        amount: u64,
    ) {
        event::emit(AggregatorEscrowFundEvent {
            aggregator_address,
            funder,
            amount,
        });
    }

    public(friend) fun emit_oracle_booted_event(
        queue_address: address,
        oracle_address: address,
    ) {
        event::emit(OracleBootedEvent {
            queue_address,
            oracle_address,
        })
    }

    public(friend) fun emit_oracle_pointer_update_event(
        queue_address: address,
        oracle_idx: u64,
    ) {
        event::emit(OraclePointerUpdateEvent {
            queue_address,
            oracle_idx,
        })
    }

    public(friend) fun emit_quote_verify_request_event(
        quote: address,
        verifier: address,
        verifiee: address,
    ) {
        event::emit(QuoteVerifyRequestEvent {
            quote,
            verifier,
            verifiee,
        })
    }

    public(friend) fun emit_queue_send_request_event(
        queue: address,
        requster: address,
        receiver: address,
        x25519_encrypted_data: vector<u8>,
        decrypt_hash: vector<u8>,
    ) {
        event::emit(QueueSendRequestEvent {
            queue,
            requster,
            receiver,
            x25519_encrypted_data,
            decrypt_hash,
        })
    }

    public(friend) fun emit_node_booted_event(
        queue_address: address,
        node_address: address,
    ) {
        event::emit(NodeBootedEvent {
            queue_address,
            node_address,
        })
    }

    public(friend) fun emit_aggregator_fast_update_event(
        aggregator_address: address,
        aggregator_token_address: address, 
        result_address: address,
        old_value: SwitchboardDecimal,
        new_value: SwitchboardDecimal
    ) {
        event::emit(AggregatorFastUpdateEvent {
            aggregator_address,
            aggregator_token_address,
            result_address,
            old_value,
            new_value,
        });
    }
}
