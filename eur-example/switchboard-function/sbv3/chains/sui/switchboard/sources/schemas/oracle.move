module switchboard::oracle {
    use switchboard::switchboard::{Self, AdminCap};
    use switchboard_std::errors;
    use switchboard_std::utils;
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::bag::{Self, Bag};
    use sui::coin::{Coin};

    // AGGREGATOR ACTIONS
    friend switchboard::aggregator_save_result_action;
    friend switchboard::aggregator_fast_save_result_action;
    
    // ORACLE ACTIONS
    friend switchboard::oracle_heartbeat_action;
    friend switchboard::oracle_init_action;
    friend switchboard::create_oracle_action;
    friend switchboard::oracle_set_configs_action;
    friend switchboard::oracle_token_withdraw_action;
    friend switchboard::oracle_escrow_withdraw_action;

    struct Oracle has key {
        id: UID,
        name: vector<u8>,
        created_at: u64,
        num_rows: u8,
        authority: address,
        queue_addr: address,
        escrows: Bag,
        token_addr: address,
        version: u64,
    }

    struct OracleToken has key {
        id: UID,
        oracle_addr: address,
        queue_addr: address,
        created_at: u64,
        expires_at: u64,
        updates: Table<address, Status>,
    }

    struct Status has store {
        last_update: u64,
        owed: u64, // how many rewards are owed to this oracle from a given aggregator
    }

    // oracle response types
    public fun OracleResponseDisagreement(): u8 { 0 }
    public fun OracleResponseSuccess(): u8 { 1 } 
    public fun OracleResponseError(): u8 { 2 }
    public fun OracleResponseNoResponse(): u8 { 3 }

    public fun can_update(
        oracle_token: &mut OracleToken, 
        aggregator_addr: address, 
        min_update_delay_seconds: u64, 
        now: u64,
    ): bool {
        if (oracle_token.expires_at < now) {
            false
        } else if (!table::contains<address, Status>(&mut oracle_token.updates, aggregator_addr)) {
            table::add(
                &mut oracle_token.updates,
                aggregator_addr,
                Status {
                    last_update: 0,
                    owed: 0,
                },
            );
            true
        } else {
            // check that it's been long enough since the last update
            let update: &Status = table::borrow<address, Status>(&mut oracle_token.updates, aggregator_addr);
            (now - update.last_update) > min_update_delay_seconds 
        }
    }

    public fun token_addr(oracle: &Oracle): address {
        oracle.token_addr
    }

    public fun oracle_token_address(token: &OracleToken): address {
        object::uid_to_address(&token.id)
    }

    public fun queue_addr(oracle: &Oracle): address {
        oracle.queue_addr
    }

    public fun authority(oracle: &Oracle): address {
        oracle.authority
    }

    public fun num_rows(oracle: &Oracle): u8 {
        oracle.num_rows
    }

    public fun has_authority(oracle: &Oracle, ctx: &TxContext): bool {
        oracle.authority == tx_context::sender(ctx)
    }

    public fun oracle_address(oracle: &Oracle): address {
        object::uid_to_address(&oracle.id)
    }

    public fun escrow_balance<CoinType>(
        oracle: &Oracle, 
        key: address
    ): u64 {
        utils::escrow_balance<CoinType>(&oracle.escrows, key)
    }
    
    public(friend) fun new(
        name: vector<u8>,
        authority: address,
        queue_addr: address,
        created_at: u64,
        ctx: &mut TxContext,
    ): Oracle {
        let id = object::new(ctx);
        let oracle = Oracle {
            id,
            name,
            created_at,
            authority,
            queue_addr,
            num_rows: 0,
            escrows: bag::new(ctx),
            token_addr: @0x0,
            version: switchboard::version(),
        };
        oracle
    }

    public fun share_oracle(oracle: Oracle) {
      transfer::share_object(oracle);
    }

    public fun transfer_oracle_token(oracle_token: OracleToken, recipient: address) {
        transfer::transfer(oracle_token, recipient);
    }

    public fun rewards_owed_to_oracle(oracle_token: &OracleToken, aggregator_addr: address): u64 {
        let update: &Status = table::borrow<address, Status>(&oracle_token.updates, aggregator_addr);
        update.owed
    }

    public fun oracle_token_data(oracle_token: &OracleToken): (address, address, u64, u64) {
        (oracle_token.oracle_addr, oracle_token.queue_addr, oracle_token.expires_at, oracle_token.created_at)
    }

    // on heartbeat, update the oracle token
    public(friend) fun update_oracle_token(oracle_token: &mut OracleToken, expires_at: u64) {
        oracle_token.expires_at = expires_at;
    }

    public(friend) fun set_token_addr(oracle: &mut Oracle, addr: address) {
        assert!(oracle.version == switchboard::version(), errors::InvalidVersion());
        oracle.token_addr = addr;
    }

    public(friend) fun new_oracle_token(
        oracle_addr: address,
        queue_addr: address,
        expires_at: u64,
        created_at: u64,
        ctx: &mut TxContext,
    ): OracleToken {
        let id = object::new(ctx);
        let oracle_token = OracleToken {
            id,
            oracle_addr,
            queue_addr,
            expires_at,
            created_at,
            updates: table::new(ctx),
        };
        oracle_token
    }

    public(friend) fun set_configs(
        oracle: &mut Oracle,         
        name: vector<u8>,
        oracle_authority: address,
        queue_addr: address,
    ) {
        assert!(oracle.version == switchboard::version(), errors::InvalidVersion());
        oracle.name = name;
        oracle.authority = oracle_authority;
        oracle.queue_addr = queue_addr;
    }

    public(friend) fun escrow_deposit<CoinType>(
        oracle: &mut Oracle, 
        addr: address,
        coin: Coin<CoinType>
    ) {
        assert!(oracle.version == switchboard::version(), errors::InvalidVersion());
        utils::escrow_deposit(&mut oracle.escrows, addr, coin);
    }

    public(friend) fun escrow_withdraw<CoinType>(
        oracle: &mut Oracle, 
        addr: address,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<CoinType> {
        assert!(oracle.version == switchboard::version(), errors::InvalidVersion());
        utils::escrow_withdraw(&mut oracle.escrows, addr, amount, ctx)
    }


    public(friend) fun update_aggregator(oracle_token: &mut OracleToken, aggregator_addr: address, now: u64) {
        let update: &mut Status = table::borrow_mut<address, Status>(&mut oracle_token.updates, aggregator_addr);
        assert!(now > update.last_update, errors::InvalidArgument());
        update.owed = update.owed + 1;
        update.last_update = now;
    }

    // Migrate to new version of switchboard
    entry fun migrate(oracle: &mut Oracle, _cap: &AdminCap) {
        assert!(oracle.version < switchboard::version(), errors::InvalidPackage());
        oracle.version = switchboard::version();
    }
}
