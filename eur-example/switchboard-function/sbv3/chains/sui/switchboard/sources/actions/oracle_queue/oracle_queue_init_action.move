module switchboard::oracle_queue_init_action {
    use switchboard::oracle_queue;
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};

    public fun validate<CoinType>() {}

    fun actuate<CoinType>(
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
    ) {
        let queue = oracle_queue::oracle_queue_create<CoinType>(
            authority,
            name,
            oracle_timeout,
            reward,
            unpermissioned_feeds_enabled,
            lock_lease_funding,
            max_size,
            created_at,
            verification_queue_addr,
            allow_service_queue_heartbeats,
            ctx,
        );
        oracle_queue::share_oracle_queue(queue);
    }

    public entry fun run<CoinType>(
        authority: address,
        name: vector<u8>,
        oracle_timeout: u64,
        reward: u64,
        unpermissioned_feeds_enabled: bool,
        lock_lease_funding: bool,
        max_size: u64,
        verification_queue_addr: address,
        allow_service_queue_heartbeats: bool,
        created_at: &Clock,
        ctx: &mut TxContext,
    ) {

        let created_at = clock::timestamp_ms(created_at) / 1000;
        validate<CoinType>();
        actuate<CoinType>(
            authority,
            name,
            oracle_timeout,
            reward,
            unpermissioned_feeds_enabled,
            lock_lease_funding,
            max_size,
            created_at,
            verification_queue_addr,
            allow_service_queue_heartbeats,
            ctx,
        );
    }
}