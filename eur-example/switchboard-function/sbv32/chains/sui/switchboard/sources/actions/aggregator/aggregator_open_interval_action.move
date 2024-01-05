module switchboard::aggregator_open_interval_action {
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard_std::errors;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use switchboard::aggregator_utils;
    use switchboard::events;
    
    use sui::coin::{Self, Coin};
    use sui::tx_context::{TxContext};
    
    public fun validate<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
    ) {
        assert!(!oracle_queue::lock_lease_funding<CoinType>(queue), errors::PermissionDenied());
    }

    fun actuate<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
        aggregator: &mut Aggregator, 
        load_coin: &mut Coin<CoinType>, 
        ctx: &mut TxContext,
    ) {

        let load_amount = oracle_queue::reward<CoinType>(queue) * (aggregator::batch_size(aggregator) + 1);
        let coin = coin::split<CoinType>(load_coin, load_amount, ctx);
        aggregator::escrow_deposit(
            aggregator, 
            oracle_queue::oracle_queue_address(queue),
            coin,
            &aggregator_utils::friend_key()
        );

        let reward = oracle_queue::reward<CoinType>(queue);
        let new_balance = aggregator::escrow_balance<CoinType>(aggregator, oracle_queue::oracle_queue_address(queue));

        // if aggregator has enough funds, start cranking it
        if (
            new_balance >= reward * (aggregator::batch_size(aggregator) + 1) && 
            !aggregator::crank_disabled(aggregator) && 
            aggregator::crank_row_count(aggregator) == 0
        ) {
            aggregator::add_crank_row_count(aggregator, &aggregator_utils::friend_key());
            oracle_queue::add_aggregator_to_crank<CoinType>(queue, aggregator::aggregator_address(aggregator));
        };

        // when this event emitted, oracles should respond nomatter what - reset payment interval to request the round sooner
        aggregator::next_payment_interval(aggregator, &aggregator_utils::friend_key());
        events::emit_aggregator_open_interval_event(
            aggregator::aggregator_address(aggregator),
            oracle_queue::oracle_queue_address(queue),
        )
    }

    public entry fun run<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
        aggregator: &mut Aggregator,
        load_coin: &mut Coin<CoinType>,
        ctx: &mut TxContext,
    ) {
        validate<CoinType>(queue);
        actuate<CoinType>(queue, aggregator, load_coin, ctx);
    }
}
