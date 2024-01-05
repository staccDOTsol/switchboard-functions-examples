module switchboard::aggregator_add_job_action {
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard_std::job::{Job};
    use switchboard_std::errors;
    use sui::tx_context::{TxContext};

    public fun validate(aggregator: &Aggregator, weight: u8, ctx: &mut TxContext) {
        assert!(aggregator::has_authority(aggregator, ctx), errors::InvalidAuthority());
        assert!(!aggregator::is_locked(aggregator), errors::AggregatorLocked());
        assert!(weight > 0, errors::InvalidArgument());
    }

    fun actuate(aggregator: &mut Aggregator, job: &Job, weight: u8, ctx: &mut TxContext) {
        aggregator::add_job(aggregator, job, weight, ctx);    
    }

    // initialize aggregator for user
    public entry fun run(
        aggregator: &mut Aggregator,
        job: &Job, 
        weight: u8,
        ctx: &mut TxContext
    ) {   
        validate(aggregator, weight, ctx);
        actuate(aggregator, job, weight, ctx);
    }
}
