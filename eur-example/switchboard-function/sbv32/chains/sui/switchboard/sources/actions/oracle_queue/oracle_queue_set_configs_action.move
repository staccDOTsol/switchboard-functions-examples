module switchboard::oracle_queue_set_configs_action {
    use switchboard_std::errors;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use sui::tx_context::{TxContext};

    public fun validate<CoinType>(
      oracle_queue: &mut OracleQueue<CoinType>,
      ctx: &mut TxContext,
    ) {
      assert!(oracle_queue::has_authority(oracle_queue, ctx), errors::PermissionDenied());
    }

    fun actuate<CoinType>(
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
        oracle_queue::set_configs<CoinType>(
            oracle_queue,
            authority,
            name,
            oracle_timeout,
            reward,
            unpermissioned_feeds_enabled,
            lock_lease_funding,
            max_size,
            verification_queue_addr,
            allow_service_queue_heartbeats,
        );
    }

    public entry fun run<CoinType>(
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
        ctx: &mut TxContext,
    ) {
        validate<CoinType>(oracle_queue, ctx);
        actuate<CoinType>(
            oracle_queue,
            authority,
            name,
            oracle_timeout,
            reward,
            unpermissioned_feeds_enabled,
            lock_lease_funding,
            max_size,
            verification_queue_addr,
            allow_service_queue_heartbeats,
        );
    }
}