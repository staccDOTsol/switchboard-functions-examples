module switchboard::create_feed_action {
    use switchboard_std::aggregator;
    use switchboard_std::job;
    use switchboard_std::math;
    use switchboard::events;
    use switchboard::aggregator_utils::{Self, FriendKey};
    use switchboard::oracle_queue::{Self, OracleQueue};
    use switchboard::aggregator_add_job_action;
    use switchboard::permission;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use std::vector;
    
    public entry fun run<CoinType>(
        authority: address,
        created_at: &Clock,

        // Aggregator
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
        read_whitelist: vector<address>,
        limit_reads_to_whitelist: bool,

        // Lease
        load_coin: &mut Coin<CoinType>,
        load_amount: u64,

        // Job 1 
        job_1_name: vector<u8>,
        job_1_data: vector<u8>,
        job_1_weight: u8,


        // Job 2
        job_2_name: vector<u8>,
        job_2_data: vector<u8>,
        job_2_weight: u8, 


        // Job 3
        job_3_name: vector<u8>,
        job_3_data: vector<u8>,
        job_3_weight: u8,


        // Job 4
        job_4_name: vector<u8>,
        job_4_data: vector<u8>,
        job_4_weight: u8, 

        // Job 5
        job_5_name: vector<u8>,
        job_5_data: vector<u8>,
        job_5_weight: u8,

        // Job 6
        job_6_name: vector<u8>,
        job_6_data: vector<u8>,
        job_6_weight: u8,

         // Job 7
        job_7_name: vector<u8>,
        job_7_data: vector<u8>,
        job_7_weight: u8,

        // Job 8
        job_8_name: vector<u8>,
        job_8_data: vector<u8>,
        job_8_weight: u8,

        // Seed 
        ctx: &mut TxContext,
    ) {

        let friend_key = aggregator_utils::friend_key();

        let created_at = clock::timestamp_ms(created_at) / 1000;
        let lease_funding = coin::split<CoinType>(load_coin, load_amount, ctx);
        let queue_addr = oracle_queue::oracle_queue_address(queue);
        let variance_threshold = math::new(variance_threshold_value, variance_threshold_scale, false);
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
            &friend_key,
            ctx
        );

        // Create and Add Jobs (if they exist)
        if (vector::length<u8>(&job_1_data) > 0) {
            let j = job::new(
                job_1_name,
                job_1_data,
                created_at,
                ctx
            );
            aggregator_add_job_action::run(
                &mut aggregator,
                &j, 
                job_1_weight,
                ctx
            );
            job::freeze_job(j);
        };

        if (vector::length<u8>(&job_2_data) > 0) {
            let j = job::new(
                job_2_name,
                job_2_data,
                created_at,
                ctx
            );
            aggregator_add_job_action::run(
                &mut aggregator,
                &j, 
                job_2_weight,
                ctx
            );
            job::freeze_job(j);
        };

        if (vector::length<u8>(&job_3_data) > 0) {
            let j = job::new(
                job_3_name,
                job_3_data,
                created_at,
                ctx
            );
            aggregator_add_job_action::run(
                &mut aggregator,
                &j, 
                job_3_weight,
                ctx
            );
            job::freeze_job(j);
        };

        if (vector::length<u8>(&job_4_data) > 0) {
            let j = job::new(
                job_4_name,
                job_4_data,
                created_at,
                ctx
            );
            aggregator_add_job_action::run(
                &mut aggregator,
                &j, 
                job_4_weight,
                ctx
            );
            job::freeze_job(j);
        };

        if (vector::length<u8>(&job_5_data) > 0) {
            let j = job::new(
                job_5_name,
                job_5_data,
                created_at,
                ctx
            );
            aggregator_add_job_action::run(
                &mut aggregator,
                &j, 
                job_5_weight,
                ctx
            );
            job::freeze_job(j);
        };

        if (vector::length<u8>(&job_6_data) > 0) {
            let j = job::new(
                job_6_name,
                job_6_data,
                created_at,
                ctx
            );
            aggregator_add_job_action::run(
                &mut aggregator,
                &j, 
                job_6_weight,
                ctx
            );
            job::freeze_job(j);
        };

        if (vector::length<u8>(&job_7_data) > 0) {
            let j = job::new(
                job_7_name,
                job_7_data,
                created_at,
                ctx
            );
            aggregator_add_job_action::run(
                &mut aggregator,
                &j, 
                job_7_weight,
                ctx
            );
            job::freeze_job(j);
        };

        if (vector::length<u8>(&job_8_data) > 0) {
            let j = job::new(
                job_8_name,
                job_8_data,
                created_at,
                ctx
            );
            aggregator_add_job_action::run(
                &mut aggregator,
                &j, 
                job_8_weight,
                ctx
            );
            job::freeze_job(j);
        };

        // get the authority from queue_addr
        let queue_authority = oracle_queue::authority<CoinType>(queue);

        // create permission
        let permission = permission::new(
            queue_authority,
            queue_addr,
            aggregator::aggregator_address(&aggregator),
            created_at,
            ctx,
        );

        // allow heartbeat permission
        if (queue_authority == tx_context::sender(ctx)) {
            permission::set(
                &mut permission,
                permission::PERMIT_ORACLE_QUEUE_USAGE(),
                created_at,
            );
        };

        oracle_queue::permission_create<CoinType>(queue, permission);

        aggregator::escrow_deposit<CoinType, FriendKey>(
            &mut aggregator, 
            oracle_queue::oracle_queue_address(queue),
            lease_funding,
            &friend_key,
        );
        
        if (!disable_crank) {
            aggregator::add_crank_row_count(&mut aggregator, &friend_key);
            oracle_queue::add_aggregator_to_crank<CoinType>(queue, aggregator::aggregator_address(&aggregator)); 
        };

        // creates authority object for aggregator
        let aggregator_authority = aggregator_utils::new_authority(&aggregator, ctx);

        // transfers authority obect to the authority
        aggregator_utils::transfer_authority(&mut aggregator, aggregator_authority, authority, ctx);
        events::emit_aggregator_init_event(aggregator::aggregator_address(&aggregator));

        // create aggregator token for immutable updates
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

        // set the token address on the aggregator
        aggregator::set_aggregator_token(&mut aggregator, aggregator_utils::aggregator_token_address(&aggregator_token), ctx);

        // freeze the token so it can be read by all oracles
        aggregator_utils::freeze_aggregator_token(aggregator_token);
        aggregator::share_aggregator(aggregator);
    }
}