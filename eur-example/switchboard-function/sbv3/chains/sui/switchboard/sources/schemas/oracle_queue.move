module switchboard::oracle_queue {
    use switchboard::switchboard::{Self, AdminCap};
    use switchboard::permission::{Self, Permission};
    use switchboard_std::utils;
    use switchboard_std::errors;
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::table_vec::{Self, TableVec};
    use sui::bag::{Self, Bag};

    friend switchboard::aggregator_init_action;
    friend switchboard::aggregator_add_job_action;
    friend switchboard::aggregator_remove_job_action;
    friend switchboard::aggregator_set_configs_action;
    friend switchboard::aggregator_save_result_action;
    friend switchboard::aggregator_open_interval_action;
    friend switchboard::aggregator_escrow_withdraw_action;
    friend switchboard::aggregator_escrow_deposit_action;
    friend switchboard::crank_push_action;
    friend switchboard::create_feed_action;
    friend switchboard::create_oracle_action;
    friend switchboard::oracle_heartbeat_action;
    friend switchboard::oracle_set_configs_action;
    friend switchboard::oracle_token_withdraw_action;
    friend switchboard::oracle_escrow_withdraw_action;
    friend switchboard::oracle_init_action;
    friend switchboard::oracle_queue_init_action;
    friend switchboard::oracle_queue_permission_init_action;
    friend switchboard::oracle_queue_permission_set_action;
    friend switchboard::oracle_queue_set_configs_action;
    friend switchboard::job_init_action;

    struct OracleQueue<phantom CoinType> has key {
        id: UID,
        name: vector<u8>,
        authority: address,
        reward: u64,
        unpermissioned_feeds_enabled: bool,
        oracle_timeout: u64,
        lock_lease_funding: bool,
        max_size: u64,
        created_at: u64,
        curr_idx: u64,
        gc_idx: u64,
        oracle_idx: u64, // incremented each save and loops around the length of oracles
        verification_queue_addr: address, 
        allow_service_queue_heartbeats: bool, // allow heartbeats from any node that has a valid quote from specified queue
        last_hb: u64,
        
        data: TableVec<address>,
        crank_feeds: Bag, // bag of feeds that are ready to be cranked
        heartbeats: Table<address, u64>,
        permissions: Table<address, Permission>,
        version: u64,
    }

    public(friend) fun set_configs<CoinType>(
        oracle_queue: &mut OracleQueue<CoinType>,
        authority: address,
        name: vector<u8>,
        oracle_timeout: u64,
        reward: u64,
        unpermissioned_feeds_enabled: bool,
        lock_lease_funding: bool,
        max_size: u64,
        verification_queue_addr: address,
        allow_service_queue_heartbeats: bool,
    ) {

        // queue metadata
        oracle_queue.lock_lease_funding = lock_lease_funding;
        oracle_queue.max_size = max_size;
        oracle_queue.name = name;

        // queue configs
        oracle_queue.unpermissioned_feeds_enabled = unpermissioned_feeds_enabled;
        oracle_queue.authority = authority;
        oracle_queue.oracle_timeout = oracle_timeout;
        oracle_queue.reward = reward;
        oracle_queue.verification_queue_addr = verification_queue_addr;
        oracle_queue.allow_service_queue_heartbeats = allow_service_queue_heartbeats;
    }

    public fun has_authority<CoinType>(oracle_queue: &OracleQueue<CoinType>, ctx: &TxContext): bool {
        oracle_queue.authority == tx_context::sender(ctx)
    }

    public fun reward<CoinType>(oracle_queue: &OracleQueue<CoinType>): u64 {
        oracle_queue.reward
    }

    public fun oracle_idx<CoinType>(oracle_queue: &OracleQueue<CoinType>): u64 {
        oracle_queue.oracle_idx
    }

    public fun lock_lease_funding<CoinType>(oracle_queue: &OracleQueue<CoinType>): bool {
        oracle_queue.lock_lease_funding
    }

    public fun authority<CoinType>(oracle_queue: &OracleQueue<CoinType>): address {
        oracle_queue.authority
    }

    public fun max_reward<CoinType>(oracle_queue: &OracleQueue<CoinType>, batch_size: u64): u64 {
        oracle_queue.reward * (batch_size + 1)
    }

    public fun unpermissioned_feeds_enabled<CoinType>(oracle_queue: &OracleQueue<CoinType>): bool {
        oracle_queue.unpermissioned_feeds_enabled
    }

    public fun data_len<CoinType>(oracle_queue: &OracleQueue<CoinType>): u64 {
        table_vec::length(&oracle_queue.data)
    }

    public fun oracle_queue_address<CoinType>(oracle_queue: &OracleQueue<CoinType>): address {
        object::uid_to_address(&oracle_queue.id)
    }

    public fun verification_queue_addr<CoinType>(oracle_queue: &OracleQueue<CoinType>): address {
        oracle_queue.verification_queue_addr
    }

    public fun allow_service_queue_heartbeats<CoinType>(oracle_queue: &OracleQueue<CoinType>): bool {
        oracle_queue.allow_service_queue_heartbeats
    }

    public fun oracle_timeout<CoinType>(oracle_queue: &OracleQueue<CoinType>): u64 {
        oracle_queue.oracle_timeout
    }

    public(friend) fun oracle_queue_create<CoinType>(
        authority: address,
        name: vector<u8>,
        oracle_timeout: u64,
        reward: u64,
        unpermissioned_feeds_enabled: bool,
        lock_lease_funding: bool,
        max_size: u64,
        created_at: u64,
        verification_queue_addr: address,
        allow_service_queue_heartbeats: bool,
        ctx: &mut TxContext,
    ): OracleQueue<CoinType> {
        let id = object::new(ctx);
        OracleQueue<CoinType> {
            id,
            name,
            lock_lease_funding,
            max_size,
            created_at,
            curr_idx: 0,
            gc_idx: 0,
            authority,
            reward,
            unpermissioned_feeds_enabled,
            oracle_timeout,
            oracle_idx: 0,
            last_hb: 0,
            verification_queue_addr,
            allow_service_queue_heartbeats,

            data: table_vec::empty(ctx), // set of oracles that can submit data
            crank_feeds: bag::new(ctx), // set of feeds that are ready to be cranked
            permissions: table::new(ctx),
            heartbeats: table::new(ctx),
            version: switchboard::version(),
        }
    }

    public(friend) fun share_oracle_queue<CoinType>(queue: OracleQueue<CoinType>) {
        transfer::share_object(queue);
    }
    
    public(friend) fun next_garbage_collection_oracle<CoinType>(oracle_queue: &mut OracleQueue<CoinType>): (address, u64) {
        assert!(oracle_queue.version == switchboard::version(), errors::InvalidVersion());
        if (table_vec::length(&oracle_queue.data) <= 1) {
            return (@0x0, 0)
        };
        let gc_address = *table_vec::borrow(&oracle_queue.data, oracle_queue.gc_idx);
        let idx = oracle_queue.gc_idx;
        oracle_queue.gc_idx = oracle_queue.gc_idx + 1;
        oracle_queue.gc_idx = oracle_queue.gc_idx % table_vec::length(&oracle_queue.data);
        (gc_address, idx)
    }

    public(friend) fun garbage_collect<CoinType>(oracle_queue: &mut OracleQueue<CoinType>, gc_idx: u64) {
        assert!(oracle_queue.version == switchboard::version(), errors::InvalidVersion());
        let addr = *table_vec::borrow(&oracle_queue.data, gc_idx);
        utils::swap_remove(&mut oracle_queue.data, gc_idx);
        table::remove(&mut oracle_queue.heartbeats, addr);
        let new_len = table_vec::length(&oracle_queue.data);
        oracle_queue.curr_idx = oracle_queue.curr_idx % new_len;
        oracle_queue.gc_idx = oracle_queue.gc_idx % new_len;
    }

    public(friend) fun push_back<CoinType>(oracle_queue: &mut OracleQueue<CoinType>, oracle: address, now: u64) {
        assert!(oracle_queue.version == switchboard::version(), errors::InvalidVersion());
        if (!table::contains(&oracle_queue.heartbeats, oracle)) {
            table_vec::push_back(&mut oracle_queue.data, oracle);
            table::add(&mut oracle_queue.heartbeats, oracle, now);
        } else {
            *table::borrow_mut(&mut oracle_queue.heartbeats, oracle) = now;
        };
        oracle_queue.last_hb = now;
    }

    public(friend) fun increment_oracle_idx<CoinType>(oracle_queue: &mut OracleQueue<CoinType>) {
        assert!(oracle_queue.version == switchboard::version(), errors::InvalidVersion());
        oracle_queue.oracle_idx = (oracle_queue.oracle_idx + 1) % table_vec::length(&oracle_queue.data);
    }

    public fun oracle_at_idx<CoinType>(oracle_queue: &OracleQueue<CoinType>, idx: u64): address {
        *table_vec::borrow(&oracle_queue.data, idx)
    }

    public fun is_expired<CoinType>(oracle_queue: &OracleQueue<CoinType>, oracle_key: address, now: u64): bool {
        // feeds are expired if the last heartbeat is older than the oracle timeout 
        (now - *table::borrow(&oracle_queue.heartbeats, oracle_key)) > oracle_queue.oracle_timeout
    }

    public(friend) fun add_aggregator_to_crank<CoinType>(oracle_queue: &mut OracleQueue<CoinType>, aggregator_key: address) {
        assert!(oracle_queue.version == switchboard::version(), errors::InvalidVersion());
        assert!(!bag::contains(&oracle_queue.crank_feeds, aggregator_key), errors::InvalidArgument());
        bag::add(&mut oracle_queue.crank_feeds, aggregator_key, true);
    }

    public(friend) fun evict_aggregator<CoinType>(oracle_queue: &mut OracleQueue<CoinType>, aggregator_key: address) {
        assert!(oracle_queue.version == switchboard::version(), errors::InvalidVersion());
        let has_feed = bag::contains(&oracle_queue.crank_feeds, aggregator_key);
        if (has_feed) {
            bag::remove<address, bool>(&mut oracle_queue.crank_feeds, aggregator_key);
        }
    }

    /**
     * config_info allows us to grab relevant configuration data 
     * and metadata about an oracle queue.
     */
    public fun configs<CoinType>(oracle_queue: &OracleQueue<CoinType>): (
        address, // Authority
        u64,     // Reward
        bool,    // Unpermissioned feeds enabled
    ) {
        (
            oracle_queue.authority,
            oracle_queue.reward,
            oracle_queue.unpermissioned_feeds_enabled,
        )
    }

    /////
    //// Permissions
    ////
    public fun permission<CoinType>(
        oracle_queue: &OracleQueue<CoinType>, 
        key: address
    ): &Permission {
        let permission = table::borrow<address, Permission>(
            &oracle_queue.permissions, 
            key
        );
        permission
    }

    public(friend) fun permission_mut<CoinType>(
        oracle_queue: &mut OracleQueue<CoinType>, 
        key: address
    ): &mut Permission {
        assert!(oracle_queue.version == switchboard::version(), errors::InvalidVersion());
        let permission = table::borrow_mut<address, Permission>(
            &mut oracle_queue.permissions, 
            key
        );
        permission
    }

    public(friend) fun permission_create<CoinType>(
        oracle_queue: &mut OracleQueue<CoinType>, 
        permission: Permission,
    ) {
        assert!(oracle_queue.version == switchboard::version(), errors::InvalidVersion());

        // add permission to aggregator queue
        table::add<address, Permission>(
            &mut oracle_queue.permissions,
            permission::key_from_permission(&permission),
            permission
        );
    }

    // Migrate to new version of switchboard
    entry fun migrate<CoinType>(queue: &mut OracleQueue<CoinType>, _cap: &AdminCap) {
        assert!(queue.version < switchboard::version(), errors::InvalidPackage());
        queue.version = switchboard::version();
    }

}
