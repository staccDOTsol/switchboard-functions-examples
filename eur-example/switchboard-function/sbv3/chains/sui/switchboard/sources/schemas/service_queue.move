module switchboard::service_queue {
    use switchboard::switchboard::{Self, AdminCap};
    use switchboard::permission::{Self, Permission};
    use switchboard_std::utils;
    use switchboard_std::errors;
    use sui::object::{Self, UID};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::table_vec::{Self, TableVec};
    use std::vector;

    friend switchboard::node_heartbeat_action;
    friend switchboard::node_init_action;
    friend switchboard::service_queue_init_action;
    friend switchboard::aggregator_escrow_deposit_action;
    friend switchboard::aggregator_escrow_withdraw_action;
    friend switchboard::crank_push_action;

    friend switchboard::service_queue_set_configs_action;
    friend switchboard::service_queue_add_mr_enclave_action;
    friend switchboard::service_queue_remove_mr_enclave_action;
    friend switchboard::service_queue_permission_init_action;
    friend switchboard::service_queue_permission_set_action;

    friend switchboard::quote_update_action;
    friend switchboard::quote_init_action;
    friend switchboard::quote_verify_action;
    friend switchboard::quote_fail_action;

    struct ServiceQueue<phantom CoinType> has key {
        id: UID,

        // Authority controls adding/removing allowed enclave measurements
        authority: address,

        node_timeout: u64,
        max_size: u64,
        
        mr_enclaves: vector<vector<u8>>,
        max_quote_verification_age: u64,
        allow_authority_override_after: u64,
        require_authority_heartbeat_permission: bool,
        require_usage_permissions: bool,
        verifier_queue_addr: address,
        enable_content_hash: bool,

        reward: u64,
        curr_idx: u64,
        gc_idx: u64,
        node_idx: u64,
        last_hb: u64,

        data: TableVec<address>,
        heartbeats: Table<address, u64>,
        permissions: Table<address, Permission>,
        escrows: Table<address, Balance<CoinType>>,
        version: u64,
    }

    public(friend) fun set_configs<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>,
        authority: address,
        reward: u64,
        node_timeout: u64,
        max_size: u64,
        max_quote_verification_age: u64,
        allow_authority_override_after: u64,
        require_authority_heartbeat_permission: bool,
        require_usage_permissions: bool,
        verifier_queue_addr: address,
    ) {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        service_queue.authority = authority;
        service_queue.reward = reward;
        service_queue.node_timeout = node_timeout;
        service_queue.max_size = max_size;
        service_queue.max_quote_verification_age = max_quote_verification_age;
        service_queue.allow_authority_override_after = allow_authority_override_after;
        service_queue.require_authority_heartbeat_permission = require_authority_heartbeat_permission;
        service_queue.require_usage_permissions = require_usage_permissions;
        service_queue.verifier_queue_addr = verifier_queue_addr;
    }

    public fun has_mr_enclave<CoinType>(service_queue: &ServiceQueue<CoinType>, mr_enclave: vector<u8>): bool {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        let i = 0;
        while (i < vector::length(&service_queue.mr_enclaves)) {
            if (vector::borrow(&service_queue.mr_enclaves, i) == &mr_enclave) {
                return true
            };
            i = i + 1;
        };
        false
    }

    public(friend) fun add_mr_enclave<CoinType>(service_queue: &mut ServiceQueue<CoinType>, mr_enclave: vector<u8>) {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        vector::push_back(&mut service_queue.mr_enclaves, mr_enclave);
    }

    // Returns true if the enclave was removed
    public(friend) fun remove_mr_enclave<CoinType>(service_queue: &mut ServiceQueue<CoinType>, mr_enclave: vector<u8>): bool {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        let i = 0;
        while (i < vector::length(&service_queue.mr_enclaves)) {
            if (vector::borrow(&service_queue.mr_enclaves, i) == &mr_enclave) {
                vector::swap_remove(&mut service_queue.mr_enclaves, i);
                return true
            };
            i = i + 1;
        };
        false
    }

    public fun last_heartbeat<CoinType>(service_queue: &ServiceQueue<CoinType>): u64 {
        service_queue.last_hb
    }

    public fun max_quote_verification_age<CoinType>(service_queue: &ServiceQueue<CoinType>): u64 {
        service_queue.max_quote_verification_age
    }

    public fun allow_authority_override_after<CoinType>(service_queue: &ServiceQueue<CoinType>): u64 {
        service_queue.allow_authority_override_after
    }

    public fun require_authority_heartbeat_permission<CoinType>(service_queue: &ServiceQueue<CoinType>): bool {
        service_queue.require_authority_heartbeat_permission
    }

    public fun require_usage_permissions<CoinType>(service_queue: &ServiceQueue<CoinType>): bool {
        service_queue.require_usage_permissions
    }

    public fun has_authority<CoinType>(service_queue: &ServiceQueue<CoinType>, ctx: &TxContext): bool {
        service_queue.authority == tx_context::sender(ctx)
    }

    public fun reward<CoinType>(service_queue: &ServiceQueue<CoinType>): u64 {
        service_queue.reward
    }

    public fun node_idx<CoinType>(service_queue: &ServiceQueue<CoinType>): u64 {
        service_queue.node_idx
    }

    public fun authority<CoinType>(service_queue: &ServiceQueue<CoinType>): address {
        service_queue.authority
    }

    public fun data_len<CoinType>(service_queue: &ServiceQueue<CoinType>): u64 {
        table_vec::length(&service_queue.data)
    }

    public fun verifier_queue_addr<CoinType>(service_queue: &ServiceQueue<CoinType>): address {
        service_queue.verifier_queue_addr
    }

    public fun service_queue_address<CoinType>(service_queue: &ServiceQueue<CoinType>): address {
        object::uid_to_address(&service_queue.id)
    }

    public fun has<CoinType>(service_queue: &ServiceQueue<CoinType>, node_address: address): bool {
        let i = 0;
        while (i < table_vec::length(&service_queue.data)) {
            if (table_vec::borrow(&service_queue.data, i) == &node_address) {
                return true
            };
            i = i + 1;
        };
        false
    }

    public fun max_size<CoinType>(service_queue: &ServiceQueue<CoinType>): u64 {
        service_queue.max_size
    }

    public fun enable_content_hash<CoinType>(service_queue: &ServiceQueue<CoinType>): bool {
        service_queue.enable_content_hash
    }

    public(friend) fun service_queue_create<CoinType>(
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
    ): ServiceQueue<CoinType> {

 
        let service_queue = ServiceQueue<CoinType> {
            id: object::new(ctx),
            authority,
            node_timeout,
            max_size,
            mr_enclaves: vector::empty<vector<u8>>(),
            max_quote_verification_age,
            allow_authority_override_after,
            require_authority_heartbeat_permission,
            require_usage_permissions,
            reward,
            curr_idx: 0,
            gc_idx: 0,
            node_idx: 0,
            last_hb: 0,
            verifier_queue_addr,
            enable_content_hash,

            data: table_vec::empty(ctx),
            heartbeats: table::new(ctx),
            permissions: table::new(ctx),
            escrows: table::new(ctx),
            version: switchboard::version(),
        };

        service_queue.verifier_queue_addr = if (verifier_queue_addr == @0x0) {
            tx_context::sender(ctx)
        } else {
            verifier_queue_addr
        };


        service_queue
    }

    public(friend) fun next<CoinType>(service_queue: &mut ServiceQueue<CoinType>): (bool, address) {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        if (table_vec::length(&service_queue.data) == 0) {
            return (false, @0x0)
        };

        let idx = service_queue.curr_idx;
        service_queue.curr_idx = service_queue.curr_idx + 1;
        service_queue.curr_idx = service_queue.curr_idx % table_vec::length(&service_queue.data);
        
        (true, *table_vec::borrow(&service_queue.data, idx))
    }

    public(friend) fun share_service_queue<CoinType>(queue: ServiceQueue<CoinType>) {
        transfer::share_object(queue);
    }
    
    public(friend) fun next_garbage_collection_node<CoinType>(service_queue: &mut ServiceQueue<CoinType>): (address, u64) {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        if (table_vec::length(&service_queue.data) <= 1) {
            return (@0x0, 0)
        };
        let gc_address = *table_vec::borrow(&service_queue.data, service_queue.gc_idx);
        let idx = service_queue.gc_idx;
        service_queue.gc_idx = service_queue.gc_idx + 1;
        service_queue.gc_idx = service_queue.gc_idx % table_vec::length(&service_queue.data);
        (gc_address, idx)
    }

    public(friend) fun garbage_collect<CoinType>(service_queue: &mut ServiceQueue<CoinType>, gc_idx: u64) {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        table::remove(&mut service_queue.heartbeats, *table_vec::borrow(&service_queue.data, gc_idx));
        utils::swap_remove(&mut service_queue.data, gc_idx);
        let new_len = table_vec::length(&service_queue.data);
        service_queue.curr_idx = service_queue.curr_idx % new_len;
        service_queue.gc_idx = service_queue.gc_idx % new_len;
    }

    public(friend) fun push_back<CoinType>(service_queue: &mut ServiceQueue<CoinType>, node: address, now: u64) {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        if (table::contains<address, u64>(&service_queue.heartbeats, node)) {
            table_vec::push_back(&mut service_queue.data, node);
            let hb = table::borrow_mut(&mut service_queue.heartbeats, node);
            *hb = now;
        } else {
            table::add(&mut service_queue.heartbeats, node, now);
        };
        service_queue.last_hb = now;
    }

    public(friend) fun increment_node_idx<CoinType>(service_queue: &mut ServiceQueue<CoinType>) {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        service_queue.node_idx = (service_queue.node_idx + 1) % table_vec::length(&service_queue.data);
    }

    public fun node_at_idx<CoinType>(service_queue: &ServiceQueue<CoinType>, idx: u64): address {
        *table_vec::borrow(&service_queue.data, idx)
    }

    public fun is_expired<CoinType>(service_queue: &ServiceQueue<CoinType>, node_key: address, now: u64): bool {

        // feeds are expired if the last heartbeat is older than the node timeout 
        (now - *table::borrow(&service_queue.heartbeats, node_key)) > service_queue.node_timeout
    }

    /////
    //// Escrows
    ////
    public(friend) fun escrow_deposit<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>, 
        addr: address,
        coin: Coin<CoinType>
    ) {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        if (!table::contains<address, Balance<CoinType>>(&service_queue.escrows, addr)) {
            let escrow = balance::zero<CoinType>();
            coin::put(&mut escrow, coin);
            table::add<address, Balance<CoinType>>(&mut service_queue.escrows, addr, escrow);
        } else {
            let escrow = table::borrow_mut<address, Balance<CoinType>>(&mut service_queue.escrows, addr);
            coin::put(escrow, coin);
        }
    }

    public(friend) fun escrow_withdraw<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>, 
        addr: address,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<CoinType> {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        let escrow = table::borrow_mut<address, Balance<CoinType>>(&mut service_queue.escrows, addr);
        coin::take(escrow, amount, ctx)
    }

    public fun escrow_balance<CoinType>(
        service_queue: &ServiceQueue<CoinType>, 
        key: address
    ): u64 {
        if (!table::contains<address, Balance<CoinType>>(&service_queue.escrows, key)) {
            0
        } else {
            let escrow = table::borrow<address, Balance<CoinType>>(&service_queue.escrows, key);
            balance::value(escrow)
        }
    }

    /////
    //// Permissions
    ////
    public fun permission<CoinType>(
        service_queue: &ServiceQueue<CoinType>, 
        key: address
    ): &Permission {
        let permission = table::borrow<address, Permission>(
            &service_queue.permissions, 
            key
        );
        permission
    }

    public(friend) fun permission_mut<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>,
        key: address
    ): &mut Permission {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());
        let permission = table::borrow_mut<address, Permission>(
            &mut service_queue.permissions, 
            key
        );
        permission
    }

    public(friend) fun permission_create<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>, 
        permission: Permission,
    ) {
        assert!(service_queue.version == switchboard::version(), errors::InvalidVersion());

        // add permission to aggregator queue
        table::add<address, Permission>(
            &mut service_queue.permissions,
            permission::key_from_permission(&permission),
            permission
        );
    }

    // Migrate to new version of switchboard
    entry fun migrate<CoinType>(queue: &mut ServiceQueue<CoinType>, _cap: &AdminCap) {
        assert!(queue.version < switchboard::version(), errors::InvalidPackage());
        queue.version = switchboard::version();
    }
}
