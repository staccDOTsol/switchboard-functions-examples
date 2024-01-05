module switchboard::permission {
    use sui::tx_context::{TxContext};
    use sui::object::{Self, UID};
    use std::bit_vector::{Self, BitVector};
    use std::vector;
    use std::hash;
    use sui::bcs;
    
    friend switchboard::create_feed_action;
    friend switchboard::create_oracle_action;
    friend switchboard::oracle_queue_permission_init_action;
    friend switchboard::oracle_queue_permission_set_action;
    friend switchboard::service_queue_permission_init_action;
    friend switchboard::service_queue_permission_set_action;

    struct Permission has key, store {
        id: UID,
        permissions: BitVector,
        authority: address,
        granter: address,
        grantee: address,
        created_at: u64,
        updated_at: u64,
    }

    // Oracle Permissions
    public fun PERMIT_ORACLE_HEARTBEAT(): u64 { 0 }
    public fun PERMIT_ORACLE_QUEUE_USAGE(): u64 { 1 }


    // Service Node Permissions
    public fun PERMIT_NODE_HEARTBEAT(): u64 { 2 }
    public fun PERMIT_SERVICE_QUEUE_USAGE(): u64 { 3 }

    public fun key_from_permission(permission: &Permission): address {
        key(&permission.authority, &permission.granter, &permission.grantee)
    }

    public fun key(
        authority: &address, 
        granter: &address,
        grantee: &address
    ): address {
        let key = b"Permission";
        vector::append(&mut key, bcs::to_bytes(granter));
        vector::append(&mut key, bcs::to_bytes(grantee));
        let bytes = bcs::to_bytes(authority);
        vector::append(&mut bytes, key);
        bcs::peel_address(&mut bcs::new(hash::sha3_256(bytes)))
    }

    public fun authority(permission: &Permission): address {
        permission.authority
    }

    public fun has(permission: &Permission, code: u64): bool{
        bit_vector::is_index_set(&permission.permissions, code)
    }

    public(friend) fun set(permission: &mut Permission, code: u64, now: u64) {
        bit_vector::set(&mut permission.permissions, code);
        permission.updated_at = now;
    }

    public(friend) fun unset(permission: &mut Permission, code: u64, now: u64) {
        bit_vector::unset(&mut permission.permissions, code);
        permission.updated_at = now;
    }

    public(friend) fun new(
        authority: address, 
        granter: address, 
        grantee: address, 
        now: u64, 
        ctx: &mut TxContext
    ): Permission {
        Permission {
            id: object::new(ctx),
            authority,
            permissions: bit_vector::new(32),
            granter,
            grantee,
            created_at: now,
            updated_at: now,
        }
    }
}
