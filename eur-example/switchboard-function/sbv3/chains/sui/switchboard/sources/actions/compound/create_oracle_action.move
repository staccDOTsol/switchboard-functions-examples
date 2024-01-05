module switchboard::create_oracle_action {
    use switchboard::permission;
    use switchboard::oracle_queue::{Self, OracleQueue};
    use switchboard::oracle;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};

    public entry fun run<CoinType>(
        name: vector<u8>,
        oracle_authority: address,
        queue: &mut OracleQueue<CoinType>,
        load_coin: &mut Coin<CoinType>,
        load_amount: u64,
        created_at: &Clock,
        ctx: &mut TxContext,
    ) {

        let created_at = clock::timestamp_ms(created_at) / 1000;
        let lease_funding = coin::split<CoinType>(load_coin, load_amount, ctx);
        let queue_addr = oracle_queue::oracle_queue_address(queue);

        // Return queue + add oracle
        let oracle = oracle::new(
            name, 
            oracle_authority, 
            queue_addr,
            created_at,
            ctx,
        );

        // get the authority from queue_addr
        let queue_authority = oracle_queue::authority<CoinType>(queue);

        // create permission
        let permission = permission::new(
            queue_authority,
            queue_addr,
            oracle::oracle_address(&oracle),
            created_at,
            ctx,
        );

        // allow heartbeat permission
        if (queue_authority == tx_context::sender(ctx)) {
            permission::set(
                &mut permission,
                permission::PERMIT_ORACLE_HEARTBEAT(),
                created_at,
            );
        };
        oracle_queue::permission_create<CoinType>(queue, permission);
        oracle::escrow_deposit<CoinType>(
            &mut oracle, 
            oracle_queue::oracle_queue_address(queue),
            lease_funding
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
}