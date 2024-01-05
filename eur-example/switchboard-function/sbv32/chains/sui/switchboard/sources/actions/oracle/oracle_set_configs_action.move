module switchboard::oracle_set_configs_action {
    use switchboard_std::errors;
    use switchboard::oracle::{Self, Oracle};
    use switchboard::oracle_queue::{Self, OracleQueue};
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};

    public fun validate<CoinType>(
        oracle: &Oracle,
        ctx: &mut TxContext,
    ) {
      assert!(oracle::has_authority(oracle, ctx), errors::PermissionDenied());
    }

    fun actuate<CoinType>(
        oracle: &mut Oracle,
        queue: &mut OracleQueue<CoinType>,
        name: vector<u8>,
        oracle_authority: address,
        now: u64,
        ctx: &mut TxContext,
    ) {

        // Return queue + add oracle
        oracle::set_configs(
            oracle,
            name, 
            oracle_authority, 
            oracle_queue::oracle_queue_address(queue),
        );

        let oracle_token = oracle::new_oracle_token(
            oracle::oracle_address(oracle),
            oracle_queue::oracle_queue_address(queue),
            0,
            now,
            ctx
        );

        oracle::set_token_addr(oracle, oracle::oracle_token_address(&oracle_token));
        oracle::transfer_oracle_token(oracle_token, oracle::authority(oracle));
    }

    public entry fun run<CoinType>(
        oracle: &mut Oracle,
        name: vector<u8>,
        oracle_authority: address,
        queue: &mut OracleQueue<CoinType>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        validate<CoinType>(
            oracle, 
            ctx,
        );
        actuate(
            oracle,
            queue,
            name, 
            oracle_authority, 
            clock::timestamp_ms(clock) / 1000,
            ctx,
        );
    }

}
