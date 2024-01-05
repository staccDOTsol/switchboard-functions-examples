module switchboard::aggregator_remove_job_action {
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard_std::errors;
    use sui::tx_context::{TxContext};

    public fun validate(aggregator: &Aggregator, ctx: &TxContext) {
        assert!(aggregator::has_authority(aggregator, ctx), errors::InvalidAuthority());
        assert!(!aggregator::is_locked(aggregator), errors::AggregatorLocked());
    }

    fun actuate(aggregator: &mut Aggregator, job_address: address, ctx: &mut TxContext) {
        aggregator::remove_job(aggregator, job_address, ctx);
    }

    // initialize aggregator for user
    public entry fun run(
        aggregator: &mut Aggregator,
        job_address: address, 
        ctx: &mut TxContext
    ) {   
        validate(aggregator, ctx);
        actuate(aggregator, job_address, ctx);
    }    
}
