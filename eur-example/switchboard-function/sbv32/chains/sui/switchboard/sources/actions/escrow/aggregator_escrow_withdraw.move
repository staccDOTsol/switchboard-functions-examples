module switchboard::aggregator_escrow_withdraw_action {
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard_std::errors;
    use switchboard::aggregator_utils::{Self, FriendKey};
    use switchboard::events;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use sui::tx_context::{TxContext};
    use sui::transfer;
    use sui::coin;

    public fun validate<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
        aggregator: &Aggregator,
        withdraw_amount: u64
    ) {
        assert!(
          aggregator::escrow_balance<CoinType>(aggregator, oracle_queue::oracle_queue_address(queue)) >= withdraw_amount, 
          errors::PermissionDenied()
        );
    }

    fun actuate<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
        aggregator: &mut Aggregator, 
        withdraw_amount: u64,
        ctx: &mut TxContext,
    ) {

        let friend_key = aggregator_utils::friend_key();
        let coin = aggregator::escrow_withdraw<CoinType, FriendKey>(
            aggregator, 
            oracle_queue::oracle_queue_address(queue),
            withdraw_amount,
            &friend_key,
            ctx,
        );
        let new_balance = aggregator::escrow_balance<CoinType>(aggregator, oracle_queue::oracle_queue_address(queue));
        let reward = oracle_queue::reward<CoinType>(queue);
        if (new_balance < reward * (aggregator::batch_size(aggregator) + 1) && 
            aggregator::crank_row_count(aggregator) == 1) {
            aggregator::sub_crank_row_count(aggregator, &friend_key);
            oracle_queue::evict_aggregator<CoinType>(queue, aggregator::aggregator_address(aggregator));
            events::emit_aggregator_crank_eviction_event(
                aggregator::aggregator_address(aggregator),
                oracle_queue::oracle_queue_address(queue),
            )
        };
        events::emit_aggregator_escrow_withdraw_event(
            aggregator::aggregator_address(aggregator),
            aggregator::authority(aggregator),
            new_balance + coin::value(&coin),
            new_balance,
        );
        transfer::public_transfer(coin, aggregator::authority(aggregator));
    }

    public entry fun run<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
        aggregator: &mut Aggregator,
        withdraw_amount: u64,
        ctx: &mut TxContext,
    ) {
        validate<CoinType>(queue, aggregator, withdraw_amount);
        actuate<CoinType>(queue, aggregator, withdraw_amount, ctx);
    }
}
