module switchboard::oracle_token_withdraw_action {
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard_std::errors;
    use switchboard::aggregator_utils::{Self, FriendKey};
    use switchboard::events;
    use switchboard::oracle::{Self, OracleToken};
    use switchboard::oracle_queue::{Self, OracleQueue};
    use sui::tx_context::{TxContext};
    use sui::transfer;
    use sui::coin;

    // Withdraw the reward owed to the oracle from the aggregator's escrow account

    public fun validate<CoinType>(
        queue: &OracleQueue<CoinType>, 
        aggregator: &Aggregator,
    ) {

        let min_withdraw_amount = oracle_queue::reward<CoinType>(queue);
        assert!(
          aggregator::escrow_balance<CoinType>(aggregator, oracle_queue::oracle_queue_address(queue)) >= min_withdraw_amount, 
          errors::PermissionDenied()
        );
    }

    fun actuate<CoinType>(
        queue: &mut OracleQueue<CoinType>, 
        oracle_token: &mut OracleToken,
        aggregator: &mut Aggregator, 
        ctx: &mut TxContext,
    ) {
        let balance = aggregator::escrow_balance<CoinType>(aggregator, oracle_queue::oracle_queue_address(queue));
        let reward = oracle_queue::reward<CoinType>(queue);
        let rewards_owed = oracle::rewards_owed_to_oracle(oracle_token, aggregator::aggregator_address(aggregator)) * reward;
        
        // get max reward or balance
        let withdraw_amount = if (balance < rewards_owed) {
            balance
        } else {
            rewards_owed
        };

        let friend_key = aggregator_utils::friend_key();

        // get payout amount
        let coin = aggregator::escrow_withdraw<CoinType, FriendKey>(
            aggregator, 
            oracle_queue::oracle_queue_address(queue),
            withdraw_amount,
            &friend_key,
            ctx,
        );

        // get remaining balance 
        let new_balance = aggregator::escrow_balance<CoinType>(aggregator, oracle_queue::oracle_queue_address(queue));

        // if the aggregator has no more rewards owed, remove it from the queue
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
        oracle_token: &mut OracleToken, 
        aggregator: &mut Aggregator,
        ctx: &mut TxContext,
    ) {
        validate<CoinType>(queue, aggregator);
        actuate<CoinType>(queue, oracle_token, aggregator, ctx);
    }
}
