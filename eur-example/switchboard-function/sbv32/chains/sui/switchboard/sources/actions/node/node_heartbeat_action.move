module switchboard::node_heartbeat_action {
    use switchboard_std::errors;
    use switchboard_std::quote::{Self, Quote};
    use switchboard::events;
    use switchboard::node::{Self, Node};
    use switchboard::service_queue::{Self, ServiceQueue};
    use switchboard::permission;
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};

    fun validate_and_actuate<CoinType>(
        node: &mut Node,         
        service_queue: &mut ServiceQueue<CoinType>,
        quote: &mut Quote,
        now: u64,
        ctx: &mut TxContext,
    ) {

        // VALIDATE

        // Check authorities
        assert!(node::has_authority(node, ctx), errors::InvalidAuthority());

        // Check that quote belongs to the node and the node is for the queue
        assert!(node::queue_addr(node) == service_queue::service_queue_address(service_queue), errors::InvalidQuoteError());
        assert!(node::node_address(node) == quote::node_addr(quote), errors::InvalidQuoteError());
        
        // Check if we have permission to heartbeat onto the queue
        let authority = service_queue::authority<CoinType>(service_queue);

        // Check if quote is valid 
        assert!(quote::is_valid(quote, now), errors::InvalidQuoteError());

        // Check permissions
        if (service_queue::require_authority_heartbeat_permission(service_queue)) {
            let pkey = permission::key(
                &authority, 
                &service_queue::service_queue_address(service_queue),
                &node::authority(node) // permissions are granted to the owner of the node
            );
            let p = service_queue::permission(service_queue, pkey);
            assert!(permission::has(p, permission::PERMIT_NODE_HEARTBEAT()), errors::PermissionDenied());
        };

        // Validate the quote is for the correct service queue with the mr_enclave
        let (content_hash_enabled, mr_enclave) = quote::verify_quote_data(quote);
        if (!content_hash_enabled) {
            assert!(service_queue::has_mr_enclave(service_queue, mr_enclave), errors::InvalidArgument());
        };

        // Ensure that the quote's queue is the verifier queue for the service queue
        assert!(quote::queue_addr(quote) == service_queue::verifier_queue_addr(service_queue), errors::InvalidQuoteError());

        // ACTUATE
        service_queue::push_back<CoinType>(service_queue, node::node_address(node), now);
        node::set_last_heartbeat(node, now);

        // GC expired nodes
        let (gc_node, gc_idx) = service_queue::next_garbage_collection_node(service_queue);
        if (gc_node == @0x0) {
            return
        };
        
        if (service_queue::is_expired<CoinType>(service_queue, gc_node, now)) {
            service_queue::garbage_collect<CoinType>(service_queue, gc_idx);
            events::emit_node_booted_event(
                service_queue::service_queue_address(service_queue),
                gc_node,
            );
        };
    }

    public entry fun run<CoinType>(
        node: &mut Node,         
        service_queue: &mut ServiceQueue<CoinType>,
        quote: &mut Quote,
        now: &Clock, 
        ctx: &mut TxContext
    ) {
        let now = clock::timestamp_ms(now) / 1000;
        validate_and_actuate<CoinType>(node, service_queue, quote, now, ctx);
    }
}
