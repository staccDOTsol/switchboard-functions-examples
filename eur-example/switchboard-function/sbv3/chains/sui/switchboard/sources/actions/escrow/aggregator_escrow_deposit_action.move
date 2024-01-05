module switchboard::aggregator_escrow_deposit_action {
    use switchboard_std::errors;
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard::aggregator_utils;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use switchboard::events;
    use sui::coin::{Self, Coin};
    use sui::tx_context::{Self, TxContext};
    
    public fun validate<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
    ) {
        assert!(!oracle_queue::lock_lease_funding<CoinType>(queue), errors::PermissionDenied());
    }

    fun actuate<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
        aggregator: &mut Aggregator, 
        coin: Coin<CoinType>, 
        ctx: &mut TxContext
    ) {
        // log the amount funded
        events::emit_aggregator_escrow_fund_event(
            aggregator::aggregator_address(aggregator),
            tx_context::sender(ctx),
            coin::value(&coin),
        );

        let friend_key = aggregator_utils::friend_key();

        // add funds to the aggregator escrow
        aggregator::escrow_deposit(
            aggregator, 
            oracle_queue::oracle_queue_address(queue),
            coin,
            &friend_key
        );
        let new_balance = aggregator::escrow_balance<CoinType>(aggregator, oracle_queue::oracle_queue_address(queue));

        // if aggregator has enough funds, start cranking it
        if (
            new_balance >= oracle_queue::reward<CoinType>(queue) * (aggregator::batch_size(aggregator) + 1) && 
            !aggregator::crank_disabled(aggregator) && 
            aggregator::crank_row_count(aggregator) == 0
        ) {
            aggregator::add_crank_row_count(aggregator, &friend_key);
            oracle_queue::add_aggregator_to_crank<CoinType>(queue, aggregator::aggregator_address(aggregator));
        };
    }

    public entry fun run<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
        aggregator: &mut Aggregator,
        load_coin: &mut Coin<CoinType>,
        load_amount: u64,
        ctx: &mut TxContext,
    ) {
        let funding = coin::split<CoinType>(load_coin, load_amount, ctx);
        validate<CoinType>(queue);
        actuate<CoinType>(queue, aggregator, funding, ctx);
    }
}
