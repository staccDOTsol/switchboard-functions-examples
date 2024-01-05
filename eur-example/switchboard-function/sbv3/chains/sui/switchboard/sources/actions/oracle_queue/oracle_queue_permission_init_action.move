module switchboard::oracle_queue_permission_init_action {
    use switchboard::permission;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};

    struct PermissionInitParams has drop, copy {
        authority: address,
        granter: address,
        grantee: address,
        now: u64
    }

    // ORACLE QUEUE OPERATIONS
    public fun validate(_params: &PermissionInitParams) {}
    fun actuate<CoinType>(
      queue: &mut OracleQueue<CoinType>,
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
        oracle_queue::permission_create<CoinType>(queue, p);
    }
    
    public entry fun run<CoinType>(
        queue: &mut OracleQueue<CoinType>,
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
