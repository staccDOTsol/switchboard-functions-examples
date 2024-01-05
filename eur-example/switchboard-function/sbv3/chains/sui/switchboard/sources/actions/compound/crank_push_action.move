module switchboard::crank_push_action {
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard_std::errors;
    use switchboard::aggregator_utils;
    use switchboard::oracle_queue::{Self, OracleQueue};

    public fun validate(aggregator: &Aggregator) {
        assert!(!aggregator::crank_disabled(aggregator), errors::CrankDisabled());
        assert!(aggregator::crank_row_count(aggregator) == 0, errors::InvalidArgument());
    }

    fun actuate<CoinType>(queue: &mut OracleQueue<CoinType>, aggregator: &mut Aggregator) {

        // can only push to the crank if there are funds for a round
        let reward = oracle_queue::reward<CoinType>(queue);
        let new_balance = aggregator::escrow_balance<CoinType>(aggregator, oracle_queue::oracle_queue_address(queue));

        // if aggregator has enough funds, start cranking it
        if (new_balance >= reward * (aggregator::batch_size(aggregator) + 1) && !aggregator::crank_disabled(aggregator)) {
            aggregator::add_crank_row_count(aggregator, &aggregator_utils::friend_key());
            oracle_queue::add_aggregator_to_crank<CoinType>(queue, aggregator::aggregator_address(aggregator));
        }
    }

    public entry fun run<CoinType>(oracle_queue: &mut OracleQueue<CoinType>, aggregator: &mut Aggregator) {

        // enforce that aggregator is on this crank
        validate(aggregator);
        actuate<CoinType>(oracle_queue, aggregator);
    }

}
