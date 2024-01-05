module switchboard::node_init_action {
    use switchboard::node;
    use switchboard::service_queue::{Self, ServiceQueue};
    use sui::tx_context::{TxContext};

    public fun validate<CoinType>(
        _node_authority: address,
        _queue_addr: address,
        _ctx: &mut TxContext,
    ) {}

    fun actuate(
        node_authority: address,
        owner: address,
        queue_addr: address,
        ctx: &mut TxContext,
    ) {
        // Return queue + add node
        let node = node::new(
            node_authority, 
            owner,
            queue_addr,
            ctx,
        );
        node::share_node(node);
    }

    public entry fun run<CoinType>(
        node_authority: address,
        owner: address,
        queue: &ServiceQueue<CoinType>,
        ctx: &mut TxContext,
    ) {

        let queue_addr = service_queue::service_queue_address(queue);
        validate<CoinType>(
            node_authority, 
            queue_addr,
            ctx,
        );
        actuate(
            node_authority, 
            owner,
            queue_addr,
            ctx,
        );
    }

}
