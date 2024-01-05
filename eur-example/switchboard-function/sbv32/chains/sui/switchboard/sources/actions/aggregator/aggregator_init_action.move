module switchboard::aggregator_init_action {
    use switchboard_std::aggregator;
    use switchboard_std::errors;
    use switchboard_std::math::{Self, SwitchboardDecimal};
    use switchboard::aggregator_utils;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use switchboard::events;
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};


    public fun validate<CoinType>(
        batch_size: u64,
        min_oracle_results: u64,
        min_job_results: u64,
        min_update_delay_seconds: u64,
    ) {
        assert!(batch_size > 0 && batch_size <= 10, errors::AggregatorInvalidBatchSize());
        assert!(min_oracle_results > 0, errors::AggregatorInvalidMinOracleResults());
        assert!(min_job_results > 0, errors::AggregatorInvalidMinJobs());
        assert!(min_oracle_results <= batch_size, errors::AggregatorInvalidBatchSize());
        assert!(min_update_delay_seconds >= 5, errors::AggregatorInvalidUpdateDelay());
    }

    fun actuate<CoinType>(
        name: vector<u8>,
        queue: &OracleQueue<CoinType>,
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
        limit_reads_to_whitelist: bool,
        created_at: u64,
        authority: address,
        ctx: &mut TxContext
    ) {
        let queue_addr = oracle_queue::oracle_queue_address(queue);
        let aggregator = aggregator::new(
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
            limit_reads_to_whitelist,
            created_at,
            authority,
            &aggregator_utils::friend_key(), // ensure that only our package can modify this aggregator
            ctx
        );

        let aggregator_authority = aggregator_utils::new_authority(&aggregator, ctx);
        let aggregator_token = aggregator_utils::new_aggregator_token(
            aggregator::aggregator_address(&aggregator),
            queue_addr,
            batch_size,
            min_oracle_results,
            min_update_delay_seconds,
            read_charge,
            reward_escrow,
            read_whitelist,
            limit_reads_to_whitelist,
            created_at,
            ctx
        );

        aggregator::set_aggregator_token(&mut aggregator, aggregator_utils::aggregator_token_address(&aggregator_token), ctx);
        aggregator_utils::freeze_aggregator_token(aggregator_token);

        // transfers authority obect to the authority
        aggregator_utils::transfer_authority(&mut aggregator, aggregator_authority, authority, ctx);
        events::emit_aggregator_init_event(aggregator::aggregator_address(&aggregator));
        aggregator::share_aggregator(aggregator);
    }

    // initialize aggregator for user
    // NOTE Type param CoinType is the Coin Type of the Oracle Queue
    public entry fun run<CoinType>(
        name: vector<u8>,
        queue: &OracleQueue<CoinType>,
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
        read_whitelist: vector<address>,
        limit_reads_to_whitelist: bool,
        time: &Clock,
        authority: address,
        ctx: &mut TxContext
    ) {

        // sender will be the authority
        let variance_threshold = math::new(variance_threshold_value, variance_threshold_scale, false);

        // get timestamp seconds for consistency
        let created_at = (clock::timestamp_ms(time) / 1000);

        validate<CoinType>(
            batch_size,
            min_oracle_results,
            min_job_results,
            min_update_delay_seconds,
        );

        actuate<CoinType>(
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
            limit_reads_to_whitelist,
            created_at,
            authority,
            ctx
        );
    }    
}
