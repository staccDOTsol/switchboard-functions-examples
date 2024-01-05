module switchboard::job_init_action {
    use switchboard_std::job;
    use sui::clock::{Self, Clock};
    use sui::tx_context::{TxContext};

    struct JobConfigParams has drop, copy {
        name: vector<u8>,
        data: vector<u8>
    }
    
    public entry fun run(
        name: vector<u8>,
        data: vector<u8>,
        created_at: &Clock,
        ctx: &mut TxContext,
    ) {   
        let created_at = clock::timestamp_ms(created_at) / 1000;
        let j = job::new(
            name,
            data,
            created_at,
            ctx
        );
        job::freeze_job(j);
    }
}
