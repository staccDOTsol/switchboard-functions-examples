module switchboard::oracle_escrow_withdraw_action {
    use switchboard_std::errors;
    use switchboard::events;
    use switchboard::oracle::{Self, Oracle};
    use switchboard::oracle_queue::{Self, OracleQueue};
    use sui::tx_context::{TxContext};
    use sui::transfer;

    public fun validate<CoinType>(
        queue: &OracleQueue<CoinType>, 
        oracle: &Oracle,
        withdraw_amount: u64
    ) {
        assert!(
          oracle::escrow_balance<CoinType>(oracle, oracle_queue::oracle_queue_address(queue)) >= withdraw_amount, 
          errors::PermissionDenied()
        );
    }

    fun actuate<CoinType>(
        queue: &OracleQueue<CoinType>, 
        oracle: &mut Oracle, 
        withdraw_amount: u64,
        ctx: &mut TxContext,
    ) {
        let coin = oracle::escrow_withdraw<CoinType>(
            oracle, 
            oracle_queue::oracle_queue_address(queue),
            withdraw_amount,
            ctx,
        );

        events::emit_oracle_withdraw_event(oracle::oracle_address(oracle), oracle::authority(oracle), withdraw_amount);
        transfer::public_transfer(coin, oracle::authority(oracle));
    }

    public entry fun run<CoinType>(
        queue: &OracleQueue<CoinType>, 
        oracle: &mut Oracle,
        withdraw_amount: u64,
        ctx: &mut TxContext,
    ) {
        validate<CoinType>(queue, oracle, withdraw_amount);
        actuate<CoinType>(queue, oracle, withdraw_amount, ctx);
    }
}
