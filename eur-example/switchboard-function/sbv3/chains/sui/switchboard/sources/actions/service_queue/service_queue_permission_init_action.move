module switchboard::service_queue_permission_init_action {
    use switchboard::permission;
    use switchboard::service_queue::{Self, ServiceQueue};
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};

    struct PermissionInitParams has drop, copy {
        authority: address,
        granter: address,
        grantee: address,
        now: u64
    }

    // SERVICE QUEUE OPERATIONS
    public fun validate(_params: &PermissionInitParams) {}
    fun actuate<CoinType>(
      queue: &mut ServiceQueue<CoinType>,
      params: &PermissionInitParams, 
      ctx: &mut TxContext
    ) {
        let p = permission::new(
            params.authority,
            params.granter,
            params.grantee,
            params.now,
            ctx
        );
        service_queue::permission_create<CoinType>(queue, p);
    }
    public entry fun run<CoinType>(
        queue: &mut ServiceQueue<CoinType>,
        authority: address,
        granter: address,
        grantee: address,
        now: &Clock,
        ctx: &mut TxContext,
    ) {   
        let now = clock::timestamp_ms(now) / 1000;
        let params = PermissionInitParams {
            authority,
            granter,
            grantee,
            now
        };
        validate(&params);
        actuate(queue, &params, ctx);
    }    
}
