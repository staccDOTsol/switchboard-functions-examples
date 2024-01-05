module switchboard::create_and_add_job_action {
    use switchboard_std::aggregator::{Self, Aggregator};
    use switchboard_std::job;
    use switchboard_std::errors;
    use switchboard::aggregator_add_job_action;
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};

    public fun validate(aggregator: &Aggregator, weight: u8, ctx: &TxContext) {
        assert!(aggregator::has_authority(aggregator, ctx), errors::InvalidAuthority());
        assert!(!aggregator::is_locked(aggregator), errors::AggregatorLocked());
        assert!(weight > 0, errors::InvalidArgument());
    }

    fun actuate(
        aggregator: &mut Aggregator, 
        name: vector<u8>,
        data: vector<u8>,
        weight: u8,
        now: u64,
        ctx: &mut TxContext
    ) {
        let j = job::new(
            name,
            data,
            now,
            ctx
        );
        aggregator_add_job_action::run(
            aggregator,
            &j, 
            weight,
            ctx
        );
        job::freeze_job(j);
    }

    
    // initialize aggregator for user
    public entry fun run(
        aggregator: &mut Aggregator, 
        name: vector<u8>,
        data: vector<u8>,
        weight: u8,
        now: &Clock,
        ctx: &mut TxContext
    ) {   
        validate(aggregator, weight, ctx);
        let now = clock::timestamp_ms(now) / 1000;
        actuate(
            aggregator, 
            name,
            data,
            weight,
            now,
            ctx
        );
    }    
}
