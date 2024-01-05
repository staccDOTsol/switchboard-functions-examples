module switchboard::quote_init_action {
    use switchboard::service_queue::{Self, ServiceQueue};
    use switchboard::node::{Self, Node};
    use switchboard::events;
    use switchboard::quote_utils;
    use switchboard::permission;
    use switchboard_std::utils;
    use switchboard_std::errors;
    use switchboard_std::quote;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::bcs;
    use std::hash;

    public fun validate<CoinType>(
        data: &vector<u8>,
        authority: address,
        queue: &mut ServiceQueue<CoinType>,
        ctx: &TxContext
    ) {

        // check that sender is the authority
        assert!(tx_context::sender(ctx) == authority, errors::InvalidArgument());


        if (service_queue::enable_content_hash(queue)) {
            // check that quote has valid formatting
            let (mr_enclave, report_data) = utils::parse_sgx_quote(data);
            assert!(hash::sha2_256(bcs::to_bytes(&authority)) == utils::slice(&report_data, 0, 32), errors::InvalidArgument());
            assert!(service_queue::has_mr_enclave(queue, mr_enclave), errors::InvalidArgument());
        };


        // check that we have usage permissions
        if (service_queue::require_usage_permissions(queue)) {
            let queue_authority = service_queue::authority(queue);
            let pkey = permission::key(
                &queue_authority, 
                &service_queue::service_queue_address(queue),
                &authority
            );
            let p = service_queue::permission(queue, pkey);

            // check that queue usage is allowed for the node authority
            assert!(
                permission::has(p, permission::PERMIT_SERVICE_QUEUE_USAGE()), 
                errors::PermissionDenied()
            );
        };
    }

    fun actuate<CoinType>(
        node_addr: address,
        verifier_queue: &mut ServiceQueue<CoinType>,
        authority: address, // authority being verified
        data: vector<u8>,
        funding: Coin<CoinType>,
        ctx: &mut TxContext,
    ) {
      
        let quote = quote::new(
            node_addr,
            authority,
            service_queue::service_queue_address(verifier_queue),
            data,
            service_queue::enable_content_hash(verifier_queue),
            &quote_utils::friend_key(),
            ctx,
        );

        // get next verifier
        let (has_data, verifier) = service_queue::next(verifier_queue);
        if (has_data) {
            // emit event
            events::emit_quote_verify_request_event(
                quote::quote_address(&quote),
                verifier,
                authority,
            );
        };

        // deposit funds into escrow
        service_queue::escrow_deposit(
            verifier_queue, 
            quote::quote_address(&quote),
            funding,
        );

        // share quote so it can be referenced by the verifier
        quote::share_quote(quote);
    }

    public entry fun run<CoinType>(
        verifier_queue: &mut ServiceQueue<CoinType>,
        node: &mut Node,
        data: vector<u8>,
        load_coin: &mut Coin<CoinType>, // must have funds for at least 1 quote verify
        ctx: &mut TxContext,
    ) {   
        validate(&data, node::authority(node), verifier_queue, ctx);

        // withdraw reward from escrow and deposit into quote 
        let funding = coin::split<CoinType>(load_coin, service_queue::reward(verifier_queue), ctx);
        actuate(node::node_address(node), verifier_queue, node::authority(node), data, funding, ctx);
    }

    public entry fun run_simple<CoinType>(
        verifier_queue: &mut ServiceQueue<CoinType>,
        authority: address,
        data: vector<u8>,
        load_coin: &mut Coin<CoinType>, // must have funds for at least 1 quote verify
        ctx: &mut TxContext,
    ) {
        validate(&data, authority, verifier_queue, ctx);

        // withdraw reward from escrow and deposit into quote 
        let funding = coin::split<CoinType>(load_coin, service_queue::reward(verifier_queue), ctx);

        // simple init shouldn't require a node
        actuate(@0x0, verifier_queue, authority, data, funding, ctx);
    }
}
