module switchboard::oracle_init_action {
    use switchboard::oracle;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};

    public fun validate<CoinType>(
        _name: vector<u8>,
        _oracle_authority: address,
        _queue_addr: address,
        _created_at: u64,
        _ctx: &mut TxContext,
    ) {}

    fun actuate(
        name: vector<u8>,
        oracle_authority: address,
        queue_addr: address,
        created_at: u64,
        ctx: &mut TxContext,
    ) {
        // Return queue + add oracle
        let oracle = oracle::new(
            name, 
            oracle_authority, 
            queue_addr,
            created_at,
            ctx,
        );

        let oracle_token = oracle::new_oracle_token(
            oracle::oracle_address(&oracle),
            queue_addr,
            0,
            created_at,
            ctx
        );

        oracle::set_token_addr(&mut oracle, oracle::oracle_token_address(&oracle_token));
        oracle::transfer_oracle_token(oracle_token, oracle::authority(&oracle));

        oracle::share_oracle(oracle);
    }

    public entry fun run<CoinType>(
        name: vector<u8>,
        oracle_authority: address,
        queue: &OracleQueue<CoinType>,
        created_at: &Clock,
        ctx: &mut TxContext,
    ) {

        let queue_addr = oracle_queue::oracle_queue_address(queue);
        let created_at = clock::timestamp_ms(created_at) / 1000;
        validate<CoinType>(
            name, 
            oracle_authority, 
            queue_addr,
            created_at,
            ctx,
        );
        actuate(
            name, 
            oracle_authority, 
            queue_addr,
            created_at,
            ctx,
        );
    }

}
