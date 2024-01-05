module switchboard::aggregator_utils {
    use switchboard::switchboard::{AdminCap};
    use switchboard_std::aggregator::{Self, Aggregator, SlidingWindow};
    use switchboard_std::math::{SwitchboardDecimal};
    use switchboard_std::errors;
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::bag::{Self, Bag};
    use sui::clock::{Clock};
    use std::vector;
    
    friend switchboard::create_feed_action;
    friend switchboard::aggregator_init_action;
    friend switchboard::aggregator_open_interval_action;
    friend switchboard::aggregator_add_job_action;
    friend switchboard::aggregator_remove_job_action;
    friend switchboard::aggregator_set_configs_action;
    friend switchboard::aggregator_save_result_action;
    friend switchboard::aggregator_escrow_deposit_action;
    friend switchboard::aggregator_escrow_withdraw_action;
    friend switchboard::oracle_token_withdraw_action;
    friend switchboard::aggregator_lock_action;
    friend switchboard::aggregator_set_authority_action;
    friend switchboard::aggregator_fast_save_result_action;
    friend switchboard::crank_push_action;

    // Used to scope Aggregator operations to the above packages
    struct FriendKey has drop {}

    // [IMMUTABLE] Aggregator Config that's submitted for immutable updates
    struct AggregatorToken has key {
        id: UID,
        aggregator_addr: address,
        queue_addr: address,
        batch_size: u64,
        min_oracle_results: u64,
        min_update_delay_seconds: u64,
        created_at: u64,
        read_charge: u64,
        reward_escrow: address,
        read_whitelist: Bag,
        limit_reads_to_whitelist: bool,
    }

    // [IMMUTABLE] Results are immutable updates for each interval - the medianized result of AggregatorUpdates
    struct Result has key {
        id: UID,
        aggregator_addr: address,
        update_data: SlidingWindow,
        timestamp: u64,
        parent: address,
    }

    // [OWNED]
    struct Authority has key, store {
        id: UID,
        aggregator_address: address,
    }
    
    // --- Initialization
    fun init(_ctx: &mut TxContext) {}

    // Used for package migration / admin ops
    public fun admin_friend_key(_admin_cap: &AdminCap): FriendKey {
        FriendKey {}
    }

    // Used to scope the Switchboard functions in std to the Switchboard Aggregator package
    public(friend) fun friend_key(): FriendKey {
        FriendKey {}
    }

    // track authority (mostly for off-chain use) - created on init
    public(friend) fun new_authority(aggregator: &Aggregator, ctx: &mut TxContext): Authority {
        let id = object::new(ctx);
        Authority {
            id,
            aggregator_address: aggregator::aggregator_address(aggregator),
        }
    }

    // create new result
    public(friend) fun new_result(
        aggregator: &AggregatorToken,
        value: SwitchboardDecimal,
        oracle_addr: address,
        timestamp: u64,
        updated: bool,
        ctx: &mut TxContext
    ): Result {

        let sliding_window = aggregator::new_sliding_window();

        if (updated) {
            aggregator::add_to_sliding_window(
                &mut sliding_window, 
                oracle_addr, 
                value, 
                aggregator.batch_size, 
                aggregator.min_oracle_results, 
                timestamp,
            );
        };

        Result {
            id: object::new(ctx),
            update_data: sliding_window,
            timestamp,
            aggregator_addr: aggregator.aggregator_addr,
            parent: @0x0,
        }
    }

    // extend a result [immutable] with a new value 
    public(friend) fun extend_result(
        result: &Result, 
        value: SwitchboardDecimal, 
        oracle_addr: address, 
        batch_size: u64,
        min_oracle_results: u64,
        timestamp: u64, 
        ctx: &mut TxContext
    ): (bool, Result) {

        // create a new result with the same sliding window
        let new_result = Result {
            id: object::new(ctx),
            update_data: result.update_data, // copy sliding window
            timestamp: result.timestamp,
            aggregator_addr: result.aggregator_addr,
            parent: result_address(result),
        };

        // add the new value to the sliding window
        let (updated, _result_data) = aggregator::add_to_sliding_window(
            &mut new_result.update_data, 
            oracle_addr, 
            value, 
            batch_size, 
            min_oracle_results, 
            timestamp,
        );

        // return the new result
        (updated, new_result)  
    }

    // transfer authority to a new user 
    public(friend) fun transfer_authority(
        aggregator: &mut Aggregator, 
        authority: Authority, 
        new_authority: address,
        ctx: &mut TxContext,
    ) {
        transfer::transfer(authority, aggregator::authority(aggregator));
        aggregator::set_authority(aggregator, new_authority, ctx);
    }

    public fun freeze_result(result: Result) {
        transfer::freeze_object(result);
    }

    // get the latest result
    // and latest timestamp
    public fun result_data(
        result: &Result, // [immutable] update result
        aggregator: &AggregatorToken, // [immutable] aggregator config data
        clock: &Clock, // [shared] clock
        max_result_age_seconds: u64, // max result age
        ctx: &TxContext 
    ): (SwitchboardDecimal, u64) {
        assert!(
            aggregator.read_charge == 0 && aggregator.limit_reads_to_whitelist == false || 
            bag::contains(&aggregator.read_whitelist, tx_context::sender(ctx)), 
            errors::PermissionDenied()
        );
        assert!(
            result.aggregator_addr == aggregator.aggregator_addr,
            errors::InvalidArgument()
        );

        // make sure that every sub-result is max age seconds old
        assert!(
            aggregator::results_older_than(
                &result.update_data, 
                clock, 
                max_result_age_seconds
            ) == false, 
            errors::InvalidArgument()
        );
        
        result(result)
    }

    public fun authority_is_for_aggregator(authority: &Authority, aggregator: &Aggregator): bool {
        return aggregator::aggregator_address(aggregator) == authority.aggregator_address
    }

    public fun aggregator_token_address(token: &AggregatorToken): address {
        object::uid_to_address(&token.id)
    }

    public fun result_address(result: &Result): address {
        object::uid_to_address(&result.id)
    }

    public fun aggregator_token_data(aggregator_token: &AggregatorToken): (
        address,
        address,
        u64,
        u64,
        u64,
        u64,
    ) {
        (
            aggregator_token.aggregator_addr,
            aggregator_token.queue_addr,
            aggregator_token.batch_size,
            aggregator_token.min_oracle_results,
            aggregator_token.min_update_delay_seconds,
            aggregator_token.created_at,
        )
    }

    public fun freeze_aggregator_token(
        aggregator_token: AggregatorToken
    ) {
        transfer::freeze_object(aggregator_token);
    }

    public(friend) fun result(result: &Result): (SwitchboardDecimal, u64) {
        aggregator::sliding_window_latest_result(&result.update_data)
    }

    // latest aggregator_token must be used to save immutable updates
    public(friend) fun new_aggregator_token(
        aggregator_addr: address,
        queue_addr: address,
        batch_size: u64,
        min_oracle_results: u64,
        min_update_delay_seconds: u64,
        read_charge: u64,
        reward_escrow: address,
        read_whitelist: vector<address>,
        limit_reads_to_whitelist: bool,
        created_at: u64,
        ctx: &mut TxContext
    ): AggregatorToken {
        let id = object::new(ctx);
        let readers = bag::new(ctx);
        let i = 0;
        while (i < vector::length(&read_whitelist)) {
            bag::add(&mut readers, *vector::borrow(&read_whitelist, i), true);
            i = i + 1;
        };
        AggregatorToken {
            id,
            aggregator_addr,
            queue_addr,
            batch_size,
            min_oracle_results,
            min_update_delay_seconds,
            read_charge,
            reward_escrow,
            read_whitelist: readers,
            limit_reads_to_whitelist,
            created_at,
        }
    }

    // For package migration only -
    // - must be called once on all existing aggregators to update them. 
    // entry fun migrate_aggregator(
    //     feed: &mut Aggregator, 
    //     _cap: &AdminCap
    // ) {
    //     aggregator::migrate_package(
    //         feed, 
    //         &switchboard_v0::aggregator_utils::admin_friend_key(_cap), 
    //         &friend_key()
    //     );
    // }

}