module switchboard::aggregator_set_configs_action {
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard_std::math::{Self, SwitchboardDecimal};
    use switchboard_std::errors;
    use switchboard::aggregator_utils;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use switchboard::events;
    use sui::tx_context::{TxContext};

    public fun validate<CoinType>(
        aggregator: &mut Aggregator,
        batch_size: u64,
        min_oracle_results: u64,
        min_job_results: u64,
        min_update_delay_seconds: u64,
        ctx: &mut TxContext
    ) {
        assert!(aggregator::has_authority(aggregator, ctx), errors::InvalidAuthority());
        assert!(!aggregator::is_locked(aggregator), errors::AggregatorLocked());
        assert!(batch_size > 0 && batch_size <= 10, errors::AggregatorInvalidBatchSize());
        assert!(min_oracle_results > 0, errors::AggregatorInvalidMinOracleResults());
        assert!(min_job_results > 0, errors::AggregatorInvalidMinJobs());
        assert!(min_oracle_results <= batch_size, errors::AggregatorInvalidBatchSize());
        assert!(min_update_delay_seconds >= 5, errors::AggregatorInvalidUpdateDelay());
    }

    fun actuate<CoinType>(
        aggregator: &mut Aggregator,
        name: vector<u8>,
        queue: &mut OracleQueue<CoinType>,
        batch_size: u64,
        min_oracle_results: u64,
        min_job_results: u64,
        min_update_delay_seconds: u64,
        variance_threshold: SwitchboardDecimal,
        force_report_period: u64,
        disable_crank: bool,
        history_limit: u64,
        read_charge: u64,
        reward_escrow: address,
        read_whitelist: vector<address>,
        remove_from_whitelist: vector<address>, 
        limit_reads_to_whitelist: bool,
        ctx: &mut TxContext
    ) {
        let friend_key = aggregator_utils::friend_key();
        let queue_addr = oracle_queue::oracle_queue_address(queue);
        if (disable_crank && aggregator::crank_row_count(aggregator) == 1) {
            aggregator::sub_crank_row_count(aggregator, &friend_key);
            oracle_queue::evict_aggregator<CoinType>(queue, aggregator::aggregator_address(aggregator));
            events::emit_aggregator_crank_eviction_event(
                aggregator::aggregator_address(aggregator),
                oracle_queue::oracle_queue_address(queue)
            );
        };

        let aggregator_token = aggregator_utils::new_aggregator_token(
            aggregator::aggregator_address(aggregator),
            queue_addr,
            batch_size,
            min_oracle_results,
            min_update_delay_seconds,
            read_charge,
            reward_escrow,
            read_whitelist,
            limit_reads_to_whitelist,
            aggregator::created_at(aggregator),
            ctx
        );

        aggregator::set_aggregator_token(aggregator, aggregator_utils::aggregator_token_address(&aggregator_token), ctx);
        aggregator_utils::freeze_aggregator_token(aggregator_token);
        aggregator::set_config(
            aggregator,
            name,
            queue_addr,
            batch_size,
            min_oracle_results,
            min_job_results,
            min_update_delay_seconds,
            variance_threshold,
            force_report_period,
            disable_crank,
            history_limit,
            read_charge,
            reward_escrow,
            read_whitelist,
            remove_from_whitelist,
            limit_reads_to_whitelist,
            ctx,
        );
    }

    // initialize aggregator for user
    // NOTE Type param CoinType is the Coin Type of the Oracle Queue
    public entry fun run<CoinType>(
        aggregator: &mut Aggregator,
        name: vector<u8>,
        queue: &mut OracleQueue<CoinType>,
        batch_size: u64,
        min_oracle_results: u64,
        min_job_results: u64,
        min_update_delay_seconds: u64,
        variance_threshold_value: u128, 
        variance_threshold_scale: u8,
        force_report_period: u64,
        disable_crank: bool,
        history_limit: u64,
        read_charge: u64,
        reward_escrow: address,
        read_whitelist: vector<address>, // must be all addresses we want to add
        rm_from_whitelist: vector<address>, // bc we can't iterate over a bag, we have to pass in the addresses to remove
        limit_reads_to_whitelist: bool,
        ctx: &mut TxContext,
    ) {

        // sender will be the authority
        let variance_threshold = math::new(variance_threshold_value, variance_threshold_scale, false);

        validate<CoinType>(
            aggregator,
            batch_size,
            min_oracle_results,
            min_job_results,
            min_update_delay_seconds,
            ctx,
        );

        actuate<CoinType>(
            aggregator,
            name,
            queue,
            batch_size,
            min_oracle_results,
            min_job_results,
            min_update_delay_seconds,
            variance_threshold,
            force_report_period,
            disable_crank,
            history_limit,
            read_charge,
            reward_escrow,
            read_whitelist,
            rm_from_whitelist,
            limit_reads_to_whitelist,
            ctx,
        );
    }    
}
