module switchboard::service_queue_set_configs_action {
    use switchboard_std::errors;
    use switchboard::service_queue::{Self, ServiceQueue};
    use sui::tx_context::{TxContext};

    public fun validate<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>,
        ctx: &mut TxContext,
    ) {
      assert!(service_queue::has_authority(service_queue, ctx), errors::PermissionDenied());
    }

    fun actuate<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>,
        authority: address,
        reward: u64,
        node_timeout: u64,
        max_size: u64,
        max_quote_verification_age: u64,
        allow_authority_override_after: u64,
        require_authority_heartbeat_permission: bool,
        require_usage_permissions: bool,
        verifier_queue_address: address,
    ) {
        service_queue::set_configs<CoinType>(
          service_queue,
          authority,
          reward,
          node_timeout,
          max_size,
          max_quote_verification_age,
          allow_authority_override_after,
          require_authority_heartbeat_permission,
          require_usage_permissions,
          verifier_queue_address,
        );
    }

    public entry fun run<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>,
        authority: address,
        reward: u64,
        node_timeout: u64,
        max_size: u64,
        max_quote_verification_age: u64,
        allow_authority_override_after: u64,
        require_authority_heartbeat_permission: bool,
        require_usage_permissions: bool,
        verifier_queue_address: address,
        ctx: &mut TxContext,
    ) {
        validate<CoinType>(
          service_queue,
          ctx,
        );
        actuate<CoinType>(
          service_queue,
          authority,
          reward,
          node_timeout,
          max_size,
          max_quote_verification_age,
          allow_authority_override_after,
          require_authority_heartbeat_permission,
          require_usage_permissions,
          verifier_queue_address,
        );
    }
}