module switchboard::aggregator_fast_save_result_action {
    use switchboard_std::errors;
    use switchboard_std::math;

    use switchboard::aggregator_utils::{Self, AggregatorToken, Result};
    use switchboard::events;
    use switchboard::oracle::{Self, OracleToken};
    use sui::tx_context::{TxContext};

    public entry fun run(
        last_result: &Result, // [Immutable]
        oracle: &mut OracleToken, // [Owned] Oracle Token - token representing the oracle / ability to report
        aggregator: &AggregatorToken, // [Immutable] Aggregator Token - immutable representation of the aggregator
        value_num: u128,
        value_scale_factor: u8, // scale factor
        value_neg: bool,
        now: u64, // self-reported by the oracle
        ctx: &mut TxContext,
    ) {

        // get oracle token data 
        let (oracle_addr, ot_queue_addr, expires_at, _ot_created_at) = oracle::oracle_token_data(oracle);
        let (
            aggregator_addr,
            at_queue_addr,
            batch_size,
            min_oracle_results,
            min_update_delay_seconds,
            _at_created_at,
        ) = aggregator_utils::aggregator_token_data(aggregator);

        // make sure we're referencing the correct aggregator
        assert!(aggregator_addr == aggregator_utils::result_address(last_result), errors::InvalidArgument());

        // get last result data 
        let (last_value, last_timestamp) = aggregator_utils::result(last_result);

        // check if oracle is allowed to report for this aggregator
        assert!(ot_queue_addr == at_queue_addr, errors::InvalidArgument());
    
        // check if oracle is allowed to report for this aggregator
        assert!(expires_at > now, errors::PermissionDenied());

        // ensure that this update is coming in after the last one
        assert!(last_timestamp < now, errors::PermissionDenied());

        // check that oracle can update the aggregator
        assert!(oracle::can_update(oracle, aggregator_addr, min_update_delay_seconds, now), errors::PermissionDenied());

        // make new SwitchboardDecimal from the value
        let new_val = math::new(value_num, value_scale_factor, value_neg);

        // EXECUTE
        // create new result
        let (did_update, result) = aggregator_utils::extend_result(
            last_result, 
            new_val,
            oracle_addr, 
            batch_size,
            min_oracle_results,
            now, 
            ctx,
        );
        if (did_update) {

            // emit event for new result
            events::emit_aggregator_fast_update_event(
                aggregator_addr,
                aggregator_utils::aggregator_token_address(aggregator), 
                aggregator_utils::result_address(&result),
                last_value,
                new_val
            );

            // allows the oracle to get funds from the aggregator
            oracle::update_aggregator(oracle, aggregator_addr, now);
        };

        // emit event for new result
        events::emit_aggregator_result_event(aggregator_addr, aggregator_utils::result_address(&result));

        // and freeze it
        aggregator_utils::freeze_result(result);
    }

    // if we can't find a last result, we create a new one and freeze it
    public entry fun initialize_result(
        oracle: &mut OracleToken, // [Owned] Oracle Token - token representing the oracle / ability to report
        aggregator: &AggregatorToken, // [Immutable] Aggregator Token - immutable representation of the aggregator
        value_num: u128,
        value_scale_factor: u8, // scale factor
        value_neg: bool,
        now: u64, // TODO: Add Clock
        ctx: &mut TxContext,
    ) {
        let (oracle_addr, ot_queue_addr, expires_at, _ot_created_at) = oracle::oracle_token_data(oracle);
        let (
            aggregator_addr,
            at_queue_addr,
            _batch_size,
            min_oracle_results,
            min_update_delay_seconds,
            _at_created_at,
        ) = aggregator_utils::aggregator_token_data(aggregator);

        // check if oracle is allowed to report for this aggregator
        assert!(ot_queue_addr == at_queue_addr, errors::InvalidArgument());
    
        // check if oracle is allowed to report for this aggregator
        assert!(expires_at > now, errors::PermissionDenied());

        // check that oracle can update the aggregator
        assert!(oracle::can_update(oracle, aggregator_addr, min_update_delay_seconds, now), errors::PermissionDenied());

        let updated = min_oracle_results == 1;

        // create new result
        let result = aggregator_utils::new_result(
            aggregator,
            math::new(value_num, value_scale_factor, value_neg),
            oracle_addr,
            now,
            updated, // update if min_oracle_results is one
            ctx,
        );

        if (updated) {
    
            // emit event for new result
            events::emit_aggregator_fast_update_event(
                aggregator_addr,
                aggregator_utils::aggregator_token_address(aggregator), 
                aggregator_utils::result_address(&result),
                math::zero(),
                math::new(value_num, value_scale_factor, value_neg)
            );

            // allows the oracle to get funds from the aggregator
            oracle::update_aggregator(oracle, aggregator_addr, now);
        };

        // emit event for new result
        events::emit_aggregator_result_event(aggregator_addr, aggregator_utils::result_address(&result));

        // freeze the initial result
        aggregator_utils::freeze_result(result);
    }
}
