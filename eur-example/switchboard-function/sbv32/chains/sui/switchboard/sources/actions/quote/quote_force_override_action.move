module switchboard::quote_force_override_action {
    use switchboard::service_queue::{Self, ServiceQueue};
    use switchboard::node::{Self, Node};
    use switchboard::quote_utils;
    use switchboard_std::errors;
    use switchboard_std::quote::{Self, Quote};
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};
    
    public entry fun run<CoinType>(
        quote: &mut Quote,
        node: &mut Node,
        verifier_queue: &mut ServiceQueue<CoinType>,
        now: &Clock,
        ctx: &mut TxContext
    ) {

        let now = clock::timestamp_ms(now) / 1000;
        let service_queue_authority = service_queue::authority(verifier_queue);
        let owner = node::owner(node);
        assert!(service_queue_authority == owner, errors::InvalidAuthority());
        assert!(service_queue::has_authority(verifier_queue, ctx), errors::InvalidAuthority());
        assert!(service_queue::service_queue_address(verifier_queue) == node::queue_addr(node), errors::InvalidConstraint());
        assert!(node::authority(node) == quote::node_authority(quote), errors::InvalidConstraint());
        assert!(node::node_address(node) == quote::node_addr(quote), errors::InvalidConstraint());
        assert!(
            (now - service_queue::last_heartbeat(verifier_queue) > 
            service_queue::allow_authority_override_after(verifier_queue)) &&
            (service_queue::allow_authority_override_after(verifier_queue) != 0), 
            errors::PermissionDenied()
        );

        let valid_until = service_queue::max_quote_verification_age(verifier_queue) + now;
        quote::force_override(quote, valid_until, now, &quote_utils::friend_key());
    }
}
