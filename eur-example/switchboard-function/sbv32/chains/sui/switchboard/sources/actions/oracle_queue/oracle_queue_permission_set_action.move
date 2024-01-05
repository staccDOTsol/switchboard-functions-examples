module switchboard::oracle_queue_permission_set_action {
    use switchboard::permission;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use switchboard_std::errors;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::{Self, Clock};

    struct PermissionSetParams has drop, copy {
        authority: address,
        granter: address,
        grantee: address,
        permission: u64,
        enable: bool,
        now: u64
    }

    // ORACLE QUEUE ------------------------------------------------------------
    public fun validate<CoinType>(queue: &mut OracleQueue<CoinType>, params: &PermissionSetParams, ctx: &mut TxContext) {
        let pkey = permission::key(
            &params.authority,
            &params.granter,
            &params.grantee,
        );
        let p = oracle_queue::permission(queue, pkey);
        assert!(permission::authority(p) == tx_context::sender(ctx), errors::InvalidAuthority());
    }

    fun actuate<CoinType>(queue: &mut OracleQueue<CoinType>, params: &PermissionSetParams) {
        let pkey = permission::key(
            &params.authority,
            &params.granter,
            &params.grantee,
        );
        let p = oracle_queue::permission_mut(queue, pkey);
        if (params.enable) {
            permission::set(p, params.permission, params.now);
        } else {
            permission::unset(p, params.permission, params.now);
        };
    }

    public entry fun run<CoinType>(
        queue: &mut OracleQueue<CoinType>,
        authority: address,
        granter: address,
        grantee: address,
        permission: u64,
        enable: bool,
        now: &Clock,
        ctx: &mut TxContext
    ) {   

        let now = clock::timestamp_ms(now) / 1000;
        let params = PermissionSetParams {
            authority,
            granter,
            grantee,
            permission,
            enable,
            now
        };

        validate(queue, &params, ctx);
        actuate(queue, &params);
    }
}
