module switchboard::oracle_heartbeat_action {
    use switchboard_std::errors;    
    use switchboard_std::quote::{Self, Quote};
    use switchboard::events;
    use switchboard::oracle::{Self, Oracle, OracleToken};
    use switchboard::oracle_queue::{Self, OracleQueue};
    use switchboard::permission;
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};

    fun validate<CoinType>(
        oracle: &mut Oracle,         
        oracle_queue: &mut OracleQueue<CoinType>,
        heartbeat_skip_enabled: bool, // skip oracle validation if we can take any valid quote as validation
        ctx: &mut TxContext,
    ) {
        assert!(oracle::has_authority(oracle, ctx), errors::InvalidAuthority());

        // VALIDATE
        if (!heartbeat_skip_enabled) {
            let authority = oracle_queue::authority<CoinType>(oracle_queue);

            // CHECK HEARTBEAT ENABLED
            let pkey = permission::key(
                &authority, 
                &oracle_queue::oracle_queue_address(oracle_queue),
                &oracle::oracle_address(oracle)
            );
            let p = oracle_queue::permission(oracle_queue, pkey);
            assert!(permission::has(p, permission::PERMIT_ORACLE_HEARTBEAT()), errors::PermissionDenied());
        }
    }

    fun actuate<CoinType>(
        oracle: &mut Oracle,         
        oracle_queue: &mut OracleQueue<CoinType>,
        now: u64,
    ) {
        
        // ACTUATE
        oracle_queue::push_back<CoinType>(oracle_queue, oracle::oracle_address(oracle), now);
        
        let (gc_oracle, gc_idx) = oracle_queue::next_garbage_collection_oracle(oracle_queue);
        if (gc_oracle == @0x0) {
            return
        };
        
        if (oracle_queue::is_expired<CoinType>(oracle_queue, gc_oracle, now)) {

            // here we'd normally decrement oracle's num rows
            oracle_queue::garbage_collect<CoinType>(oracle_queue, gc_idx);

            // we boot whichever oracle is at that address
            events::emit_oracle_booted_event(
                oracle_queue::oracle_queue_address(oracle_queue),
                gc_oracle,
            );
        }
    }

    // Regular updates without TEE
    public entry fun run<CoinType>(
        oracle: &mut Oracle,         
        oracle_queue: &mut OracleQueue<CoinType>,
        now: &Clock, 
        ctx: &mut TxContext
    ) {

        let now = clock::timestamp_ms(now) / 1000;
        
        // ensure tee is disabled
        assert!(oracle_queue::verification_queue_addr<CoinType>(oracle_queue) == @0x0, errors::InvalidArgument());
        validate<CoinType>(oracle, oracle_queue, false, ctx);
        actuate<CoinType>(oracle, oracle_queue, now);
    }

    // Regular updates with TEE enabled 
    public entry fun run_with_tee<CoinType>(
        oracle: &mut Oracle,
        oracle_queue: &mut OracleQueue<CoinType>,
        quote: &mut Quote,
        now: &Clock, 
        ctx: &mut TxContext
    ) {
        // validate quote
        let now = clock::timestamp_ms(now) / 1000;
        quote::is_valid(quote, now);

        // ensure quote is coming from the right place
        assert!(quote::queue_addr(quote) == oracle_queue::verification_queue_addr(oracle_queue), errors::InvalidArgument());
        assert!(quote::node_authority(quote) == oracle::authority(oracle), errors::PermissionDenied());
        let heartbeat_skip_enabled = oracle_queue::allow_service_queue_heartbeats(oracle_queue);
        validate<CoinType>(oracle, oracle_queue, heartbeat_skip_enabled, ctx);
        actuate<CoinType>(oracle, oracle_queue, now);
    }

    // Heartbeat with oracle token for fast updates - with V3 disabled
    public entry fun run_with_token<CoinType>(
        oracle: &mut Oracle,      
        oracle_queue: &mut OracleQueue<CoinType>,
        oracle_token: &mut OracleToken,
        now: &Clock, 
        ctx: &mut TxContext
    ) {
        let now = clock::timestamp_ms(now) / 1000;
        // make sure tee is disabled
        assert!(oracle::token_addr(oracle) == oracle::oracle_token_address(oracle_token), errors::InvalidArgument());
        assert!(oracle_queue::verification_queue_addr<CoinType>(oracle_queue) == @0x0, errors::InvalidArgument());
        validate<CoinType>(oracle, oracle_queue, false, ctx);
        actuate<CoinType>(oracle, oracle_queue, now);
        oracle::update_oracle_token(oracle_token, now + oracle_queue::oracle_timeout(oracle_queue));
    }

    // Fast updates must be TEE enabled
    public entry fun run_with_tee_and_token<CoinType>(
        oracle: &mut Oracle,      
        oracle_queue: &mut OracleQueue<CoinType>,
        quote: &mut Quote,
        oracle_token: &mut OracleToken,
        now: &Clock, 
        ctx: &mut TxContext
    ) {
        let now = clock::timestamp_ms(now) / 1000;
        // validate quote
        quote::is_valid(quote, now);
        assert!(quote::queue_addr(quote) == oracle_queue::verification_queue_addr(oracle_queue), errors::InvalidArgument());
        assert!(oracle::token_addr(oracle) == oracle::oracle_token_address(oracle_token), errors::InvalidArgument());
        assert!(quote::node_authority(quote) == oracle::authority(oracle), errors::PermissionDenied());
        let heartbeat_skip_enabled = oracle_queue::allow_service_queue_heartbeats(oracle_queue);
        validate<CoinType>(oracle, oracle_queue, heartbeat_skip_enabled, ctx);
        actuate<CoinType>(oracle, oracle_queue, now);
        oracle::update_oracle_token(oracle_token, now + oracle_queue::oracle_timeout(oracle_queue));
    }
}
