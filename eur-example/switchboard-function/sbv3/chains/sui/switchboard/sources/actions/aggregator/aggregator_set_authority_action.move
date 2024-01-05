module switchboard::aggregator_set_authority_action {
    use switchboard_std::aggregator::{Aggregator};
    use switchboard_std::errors;
    use switchboard::aggregator_utils::{Self, Authority};
    use sui::tx_context::{TxContext};


    public fun validate(
        aggregator: &mut Aggregator,
        authority: &Authority,
    ) {
        assert!(aggregator_utils::authority_is_for_aggregator(authority, aggregator), errors::InvalidAuthority());
    }

    fun actuate(
        aggregator: &mut Aggregator,
        authority: Authority,
        new_authority: address,
        ctx: &mut TxContext,
    ) {
        aggregator_utils::transfer_authority(aggregator, authority, new_authority, ctx);
    }

    public entry fun run(
        aggregator: &mut Aggregator,
        authority: Authority,
        new_authority: address,
        ctx: &mut TxContext,
    ) {


        validate(
          aggregator,
          &authority
        );

        actuate(
            aggregator,
            authority,
            new_authority,
            ctx,
        );
    }    
}
