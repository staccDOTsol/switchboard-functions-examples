module switchboard::quote_update_action {
    use switchboard::service_queue::{Self, ServiceQueue};
    use switchboard::node::{Self, Node};
    use switchboard::quote_utils;
    use switchboard::permission;
    use switchboard::events;
    use switchboard_std::utils;
    use switchboard_std::quote::{Self, Quote};
    use switchboard_std::errors;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::bcs;
    use std::hash;
    
    public fun validate<CoinType>(
        node_addr: address,
        authority: address,
        data: &vector<u8>,
        quote: &mut Quote,
        queue: &mut ServiceQueue<CoinType>,
        ctx: &mut TxContext,
    ) {
        assert!(quote::node_addr(quote) == node_addr, errors::InvalidConstraint());
        assert!(quote::node_authority(quote) == authority, errors::InvalidAuthority());
        assert!(
            quote::queue_addr(quote) == service_queue::service_queue_address(queue), 
            errors::InvalidArgument()
        );
        assert!(
            quote::queue_addr(quote) != service_queue::service_queue_address(queue), 
            errors::InvalidArgument()
        );
        assert!(
            tx_context::sender(ctx) == authority, errors::InvalidAuthority()
        );
        
        // check that quote has valid formatting
        let (mr_enclave, report_data) = utils::parse_sgx_quote(data);
        assert!(hash::sha2_256(bcs::to_bytes(&authority)) == utils::slice(&report_data, 0, 32), errors::InvalidArgument());
        assert!(service_queue::has_mr_enclave(queue, mr_enclave), errors::InvalidArgument());

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
        authority: address,
        verifier_queue: &mut ServiceQueue<CoinType>,
        quote: &mut Quote, // Every Node is assigned a quote on init. 
        data: vector<u8>,
    ) {

        // update quote data
        quote::set_configs(
            quote,
            node_addr,
            authority,
            service_queue::service_queue_address(verifier_queue),
            data,
            0,
            0,
            0,
            &quote_utils::friend_key(),
        );

        // get next verifier
        let (has_data, verifier) = service_queue::next(verifier_queue);

        // if queue is empty, then we are done
        if (has_data) {

            // emit event
            events::emit_quote_verify_request_event(
                quote::quote_address(quote),
                verifier,
                authority,
            );
        };
    }

    public entry fun run<CoinType>(
        verifier_queue: &mut ServiceQueue<CoinType>,
        node: &mut Node,
        quote: &mut Quote, // every node is assigned a quote on init
        data: vector<u8>,
        load_coin: &mut Coin<CoinType>, // must have funds for at least 1 quote verify
        ctx: &mut TxContext,
    ) {
        validate(
            node::node_address(node),
            node::authority(node),
            &data,
            quote,
            verifier_queue,
            ctx,
        );
        let funding = coin::split<CoinType>(load_coin, service_queue::reward(verifier_queue), ctx);

        // add funds to the aggregator escrow
        service_queue::escrow_deposit(
            verifier_queue, 
            quote::quote_address(quote),
            funding
        );
        actuate(
            node::node_address(node),
            node::authority(node),
            verifier_queue, 
            quote, 
            data
        );
    }   

    public entry fun run_simple<CoinType>(
        verifier_queue: &mut ServiceQueue<CoinType>,
        authority: address,
        quote: &mut Quote, // every node is assigned a quote on init
        data: vector<u8>,
        load_coin: &mut Coin<CoinType>, // must have funds for at least 1 quote verify
        ctx: &mut TxContext,
    ) {
        validate(
            @0x0,
            authority,
            &data,
            quote,
            verifier_queue,
            ctx,
        );
        let funding = coin::split<CoinType>(load_coin, service_queue::reward(verifier_queue), ctx);

        // add funds to the aggregator escrow
        service_queue::escrow_deposit(
            verifier_queue, 
            quote::quote_address(quote),
            funding
        );
        actuate(
            @0x0,
            authority,
            verifier_queue, 
            quote, 
            data
        );
    }
}
