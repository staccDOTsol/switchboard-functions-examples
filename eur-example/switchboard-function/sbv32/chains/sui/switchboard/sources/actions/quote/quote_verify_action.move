module switchboard::quote_verify_action {
    use switchboard_std::errors;
    use switchboard_std::quote::{Self, Quote};
    use switchboard::quote_utils;
    use switchboard::service_queue::{Self, ServiceQueue};
    use switchboard::node::{Self, Node};
    use switchboard::permission;
    use switchboard::quote_fail_action;
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};
    use sui::transfer;

    public fun validate<CoinType>(
        quote: &Quote,
        verifier_queue: &ServiceQueue<CoinType>,
        verifier_node: &Node,
        verifier_quote: &Quote,
        now: u64,
        clock: &Clock,
        node_idx: u64,
        ctx: &mut TxContext,
    ): bool {
        
        // make sure that quotes can only be verified if they are pending or override - to limit payouts
        let status = quote::verification_status(quote);
        assert!(status == quote::VERIFICATION_PENDING() || status == quote::VERIFICATION_OVERRIDE(), errors::InvalidArgument());

        // ensure that quotes can't be verified by the same node that created them
        assert!(quote::node_authority(quote) != quote::node_authority(verifier_quote), errors::InvalidArgument());

        // check authorities and queue addresses
        assert!(node::has_authority(verifier_node, ctx), errors::InvalidAuthority());

        // validate verifier quote and machine clock
        assert!(quote::valid_until(verifier_quote) > now, errors::InvalidTimestamp());
        let verifier_status = quote::verification_status(verifier_quote);
        assert!(verifier_status == quote::VERIFICATION_SUCCESS() || verifier_status == quote::VERIFICATION_OVERRIDE(), errors::InvalidArgument());
        let timestamp = (clock::timestamp_ms(clock) / 1000);
        let time_diff = if (now > timestamp) {
            now - timestamp
        } else {
            timestamp - now
        };

        // if we're 600 seconds off then reject
        assert!(time_diff > 600, errors::InvalidTimestamp());

        // Check verifier quote is still valid
        // check that quote has valid formatting
        let (content_hash_enabled, mr_enclave) = quote::verify_quote_data(verifier_quote);
        if (!content_hash_enabled) {
            assert!(service_queue::has_mr_enclave(verifier_queue, mr_enclave), errors::InvalidArgument());
        };
        
        // Check if quote is valid
        quote::verify_quote_data(quote);

        // make sure that the node is in the queue
        assert!(service_queue::node_at_idx(verifier_queue, node_idx) == node::node_address(verifier_node), errors::PermissionDenied());

        // if we need to, check permissions for the queue
        if (service_queue::require_usage_permissions(verifier_queue)) {

            // check if feed is enabled on the queue
            let authority = service_queue::authority(verifier_queue);
            let pkey = permission::key(
                &authority, 
                &service_queue::service_queue_address(verifier_queue),
                &quote::node_authority(quote)
            );
            let p = service_queue::permission(verifier_queue, pkey);

            // check that queue usage is allowed for the node authority
            permission::has(p, permission::PERMIT_SERVICE_QUEUE_USAGE()) 
        } else {
            true
        }
    }

    fun actuate<CoinType>(
        quote: &mut Quote,
        verifier_node: &Node,
        verifier_queue: &mut ServiceQueue<CoinType>,
        now: u64,
        ctx: &mut TxContext,
    ) { 
        
        // Set quote verification status - nodes can get verified if they have a valid quote
        let valid_until = now + service_queue::max_quote_verification_age(verifier_queue);
        quote::verify(quote, valid_until, now, &quote_utils::friend_key());
        
        // Do payout to verifier node owner
        let owner = node::owner(verifier_node);
        let amount = service_queue::reward(verifier_queue);

        // deposit the reward in the oracle's lease
        let coin = service_queue::escrow_withdraw<CoinType>(verifier_queue, quote::quote_address(quote), amount, ctx);
        
        // transfer it to the verifier node owner
        transfer::public_transfer(coin, owner);
    }

    public entry fun run<CoinType>(
        quote: &mut Quote,
        verifier_queue: &mut ServiceQueue<CoinType>,
        verifier_node: &Node,
        verifier_quote: &Quote,
        node_idx: u64,
        now: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let verifiable: bool = validate<CoinType>(
            quote,
            verifier_queue,
            verifier_node,
            verifier_quote,
            now,
            clock,
            node_idx,
            ctx,
        );

        if (verifiable) {
            actuate<CoinType>(
                quote,
                verifier_node,
                verifier_queue,
                now,
                ctx,
            );
        } else {

            // if the quote is not verifiable due to permissions, fail it
            quote_fail_action::actuate(
                quote,
                verifier_node,
                verifier_queue,
                ctx
            );
        };
    }
}