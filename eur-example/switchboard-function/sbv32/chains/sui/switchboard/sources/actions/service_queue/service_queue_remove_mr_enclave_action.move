module switchboard::service_queue_remove_mr_enclave_action {
    use switchboard_std::errors;
    use switchboard::service_queue::{Self, ServiceQueue};
    use sui::tx_context::{TxContext};

    public fun validate<CoinType>(
        service_queue: &ServiceQueue<CoinType>,
        mr_enclave: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(service_queue::has_authority(service_queue, ctx), errors::InvalidAuthority());
        assert!(service_queue::has_mr_enclave(service_queue, mr_enclave), errors::MrEnclaveDoesNotExist());
    }

    fun actuate<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>,
        mr_enclave: vector<u8>,
    ) {
        service_queue::remove_mr_enclave(service_queue, mr_enclave);
    }

    public entry fun run<CoinType>(
        service_queue: &mut ServiceQueue<CoinType>,
        mr_enclave: vector<u8>,
        ctx: &mut TxContext,
    ) {
        validate<CoinType>(
            service_queue,
            mr_enclave,
            ctx,
        );
        actuate<CoinType>(
            service_queue,
            mr_enclave,
        );
    }

}