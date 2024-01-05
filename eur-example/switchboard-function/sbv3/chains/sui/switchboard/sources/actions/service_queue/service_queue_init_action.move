module switchboard::service_queue_init_action {
    use switchboard::service_queue;
    use sui::tx_context::{TxContext};

    public fun validate<CoinType>() {}

    fun actuate<CoinType>(
        authority: address,
        reward: u64,
        node_timeout: u64,
        max_size: u64,
        max_quote_verification_age: u64,
        allow_authority_override_after: u64,
        require_authority_heartbeat_permission: bool,
        require_usage_permissions: bool,
        verifier_queue_addr: address,
        enable_content_hash: bool,
        ctx: &mut TxContext
    ) {
        let queue = service_queue::service_queue_create<CoinType>(
            authority,
            reward,
            node_timeout,
            max_size,
            max_quote_verification_age,
            allow_authority_override_after,
            require_authority_heartbeat_permission,
            require_usage_permissions,
            verifier_queue_addr,
            enable_content_hash,
            ctx,
        );   
        service_queue::share_service_queue(queue);
    }

    public entry fun run<CoinType>(
        authority: address,
        reward: u64,
        node_timeout: u64,
        max_size: u64,
        max_quote_verification_age: u64,
        allow_authority_override_after: u64,
        require_authority_heartbeat_permission: bool,
        require_usage_permissions: bool,
        verifier_queue_addr: address,
        enable_content_hash: bool,
        ctx: &mut TxContext
    ) {
        validate<CoinType>();
        actuate<CoinType>(
            authority,
            reward,
            node_timeout,
            max_size,
            max_quote_verification_age,
            allow_authority_override_after,
            require_authority_heartbeat_permission,
            require_usage_permissions,
            verifier_queue_addr,
            enable_content_hash,
            ctx,
        );
    }

}