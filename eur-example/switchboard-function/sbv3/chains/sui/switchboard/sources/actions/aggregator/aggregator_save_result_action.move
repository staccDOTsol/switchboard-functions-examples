module switchboard::aggregator_save_result_action {
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard_std::errors;
    use switchboard_std::math;
    use switchboard_std::quote::{Self, Quote};

    use switchboard::aggregator_utils::{Self, FriendKey};
    use switchboard::events;
    use switchboard::permission;
    use switchboard::oracle::{Self, Oracle};
    use switchboard::oracle_queue::{Self, OracleQueue};
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};

    public entry fun validate<CoinType>(
        oracle: &mut Oracle,
        oracle_idx: u64, // oracle idx in the queue
        aggregator: &mut Aggregator,
        oracle_queue: &OracleQueue<CoinType>,
        ctx: &mut TxContext,
    ) {

        /////
        // VALIDATE
        //
        assert!(oracle::has_authority(oracle, ctx), errors::InvalidAuthority());

        // make sure queue matches
        assert!(oracle_queue::oracle_queue_address(oracle_queue) == aggregator::queue_address(aggregator), errors::InvalidArgument());

        // make sure that the oracle is in the queue
        assert!(oracle_queue::oracle_at_idx(oracle_queue, oracle_idx) == oracle::oracle_address(oracle), errors::PermissionDenied());

        // if we need to, check permissions
        if (!oracle_queue::unpermissioned_feeds_enabled(oracle_queue)) {

            // check if feed is enabled on the queue
            let authority = oracle_queue::authority<CoinType>(oracle_queue);

            // TODO: maybe embed the permission in the oracle queue escrow - this way we don't have to hash on-chain every response
            let pkey = permission::key(
                &authority, 
                &oracle_queue::oracle_queue_address(oracle_queue),
                &aggregator::aggregator_address(aggregator)
            );
            let p = oracle_queue::permission(oracle_queue, pkey);
            assert!(permission::has(p, permission::PERMIT_ORACLE_QUEUE_USAGE()), errors::PermissionDenied());
        };
    }    

    fun actuate<CoinType>(
        oracle: &mut Oracle,
        aggregator: &mut Aggregator,
        oracle_queue: &mut OracleQueue<CoinType>,
        value_num: u128,
        value_scale_factor: u8, // scale factor
        value_neg: bool,
        now: u64,
        ctx: &mut TxContext,
    ) {

        let (last_result, _last_timestamp) = aggregator::latest_value(aggregator);
        let value = math::new(value_num, value_scale_factor, value_neg);
        let friend_key = aggregator_utils::friend_key();

        // add result to sliding window
        let (confirmed, new_value) = aggregator::push_update(
            aggregator,
            oracle::oracle_address(oracle),
            value,
            now,
            &friend_key
        );

        if (confirmed) {
            events::emit_aggregator_update_event(
                aggregator::aggregator_address(aggregator),
                last_result,
                new_value,
            );
        };

        // shift the pointer for the oracle idx
        oracle_queue::increment_oracle_idx(oracle_queue);

        // check if interval has been finished up 
        if (aggregator::curr_interval_payouts(aggregator) < aggregator::batch_size(aggregator)) {
            
            // only batch_size payments should happen in a given interaval of length min_update_delay_seconds
            aggregator::increment_curr_interval_payouts(aggregator, &friend_key);

            // payout oracle - the oracle should crank this in parallel
            let payout = oracle_queue::reward(oracle_queue);

            // deposit the reward in the oracle's lease
            let coin = aggregator::escrow_withdraw<CoinType, FriendKey>(
                aggregator, 
                oracle_queue::oracle_queue_address(oracle_queue), 
                payout, 
                &friend_key, 
                ctx
            );


            oracle::escrow_deposit(oracle, oracle_queue::oracle_queue_address(oracle_queue), coin);
            let new_balance = aggregator::escrow_balance<CoinType>(aggregator, oracle_queue::oracle_queue_address(oracle_queue));
            
            // emit reward event
            events::emit_oracle_reward_event(
                aggregator::aggregator_address(aggregator),
                oracle::oracle_address(oracle),
                payout,
            );

            // if aggregator is out of funds - stop cranking it
            if (new_balance < payout * (aggregator::batch_size(aggregator) + 1) && aggregator::crank_row_count(aggregator) == 1) {
                aggregator::sub_crank_row_count(aggregator, &friend_key);
                oracle_queue::evict_aggregator(oracle_queue, aggregator::aggregator_address(aggregator));
                events::emit_aggregator_crank_eviction_event(
                    aggregator::aggregator_address(aggregator),
                    oracle_queue::oracle_queue_address(oracle_queue)
                );
            };
        };

        // emit save event
        events::emit_aggregator_save_result_event(
            aggregator::aggregator_address(aggregator),
            oracle::oracle_address(oracle),
            value,
        );

        // emit oracle pointer update
        events::emit_oracle_pointer_update_event(
            oracle_queue::oracle_queue_address(oracle_queue),
            oracle_queue::oracle_idx(oracle_queue),
        );
    }

    public entry fun run<CoinType>(
        oracle: &mut Oracle,
        oracle_idx: u64, // oracle idx in the queue
        aggregator: &mut Aggregator,
        oracle_queue: &mut OracleQueue<CoinType>,
        value_num: u128,
        value_scale_factor: u8, // scale factor
        value_neg: bool,
        now: &Clock, 
        ctx: &mut TxContext,
    ) {

        // verify that service queue is not enabled
        assert!(oracle_queue::verification_queue_addr<CoinType>(oracle_queue) == @0x0, errors::InvalidArgument());
        let now = clock::timestamp_ms(now) / 1000;

        validate<CoinType>(
            oracle,
            oracle_idx,
            aggregator,
            oracle_queue,
            ctx,
        );

        actuate<CoinType>(
            oracle,
            aggregator,
            oracle_queue,
            value_num,
            value_scale_factor, // scale factor
            value_neg,
            now,
            ctx,
        )
    }


    public entry fun run_with_tee<CoinType>(
        oracle: &mut Oracle,
        oracle_idx: u64, // oracle idx in the queue
        aggregator: &mut Aggregator,
        oracle_queue: &mut OracleQueue<CoinType>,
        value_num: u128,
        value_scale_factor: u8, // scale factor
        value_neg: bool,
        quote: &Quote,
        now: &Clock, // TODO: Add Clock
        ctx: &mut TxContext,
    ) {
        assert!(quote::queue_addr(quote) == oracle_queue::verification_queue_addr(oracle_queue), errors::InvalidArgument());
        assert!(quote::node_authority(quote) == oracle::authority(oracle), errors::PermissionDenied());
        let now = clock::timestamp_ms(now) / 1000;

        validate<CoinType>(
            oracle,
            oracle_idx,
            aggregator,
            oracle_queue,
            ctx,
        );

        actuate<CoinType>(
            oracle,
            aggregator,
            oracle_queue,
            value_num,
            value_scale_factor, // scale factor
            value_neg,
            now,
            ctx,
        )
    }
}
