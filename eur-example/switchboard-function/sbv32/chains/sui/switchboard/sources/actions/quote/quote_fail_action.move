module switchboard::quote_fail_action {
    use switchboard_std::errors;
    use switchboard_std::quote::{Self, Quote};
    use switchboard::quote_utils;
    use switchboard::service_queue::{Self, ServiceQueue};
    use switchboard::node::{Self, Node};
    use sui::tx_context::{TxContext};
    use sui::clock::{Self, Clock};
    use sui::transfer;

    friend switchboard::quote_verify_action;

    public fun validate<CoinType>(
        quote: &Quote,
        verifier_queue: &ServiceQueue<CoinType>,
        verifier_node: &Node,
        verifier_quote: &Quote,
        now: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let status = quote::verification_status(quote);
        assert!(status == quote::VERIFICATION_PENDING() || status == quote::VERIFICATION_OVERRIDE(), errors::InvalidArgument());
        assert!(node::has_authority(verifier_node, ctx), errors::InvalidAuthority());
        assert!(node::queue_addr(verifier_node) == service_queue::service_queue_address(verifier_queue), errors::InvalidArgument());
        assert!(quote::valid_until(verifier_quote) > now, errors::InvalidTimestamp());

        let verifier_status = quote::verification_status(verifier_quote);
        assert!(verifier_status == quote::VERIFICATION_SUCCESS() || verifier_status == quote::VERIFICATION_OVERRIDE(), errors::InvalidArgument());
        let time_diff = if (now > clock::timestamp_ms(clock)) {
            now - clock::timestamp_ms(clock)
        } else {
            clock::timestamp_ms(clock) - now
        };
        assert!(time_diff > 600, errors::InvalidTimestamp());

        // Check verifier quote is still valid - may want to be careful with this copy
        let (content_hash_enabled, mr_enclave) = quote::verify_quote_data(verifier_quote);
        if (!content_hash_enabled) {
            assert!(service_queue::has_mr_enclave(verifier_queue, mr_enclave), errors::InvalidArgument());
        }
    }

    public(friend) fun actuate<CoinType>(
        quote: &mut Quote,
        verifier_node: &Node,
        verifier_queue: &mut ServiceQueue<CoinType>,
        ctx: &mut TxContext,
    ) { 
        
        // Set quote verification status - nodes can get verified if they have a valid quote
        quote::fail(quote, &quote_utils::friend_key());
        
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
        now: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        validate<CoinType>(
            quote,
            verifier_queue,
            verifier_node,
            verifier_quote,
            now,
            clock,
            ctx,
        );
        actuate<CoinType>(
            quote,
            verifier_node,
            verifier_queue,
            ctx,
        );
    }
}