module switchboard::service_queue_send_request_action {
    use switchboard::service_queue::{ServiceQueue};
    use sui::tx_context::{TxContext};

    public fun validate<CoinType>() {}

    fun actuate<CoinType>() {}

    public entry fun run<CoinType>(
        _service_queue: &mut ServiceQueue<CoinType>,
        _target_node: address,
        _x25519_encrypted_data: vector<u8>,
        _decrypt_hash: vector<u8>,
        _ctx: &mut TxContext,
    ) {
        validate<CoinType>();
        actuate<CoinType>();
    }
}