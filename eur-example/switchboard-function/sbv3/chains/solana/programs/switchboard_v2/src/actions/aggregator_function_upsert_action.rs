use crate::*;

use anchor_lang::prelude::*;
use switchboard_solana::FunctionAccountData;

#[derive(Accounts)]
#[instruction(params: AggregatorFunctionUpsertParams)] // rpc parameters hint
pub struct AggregatorFunctionUpsert<'info> {
    #[account(init_if_needed,
        seeds = [
            AGGREGATOR_SEED,
            function.key().as_ref(),
            params.name.as_ref(),
        ],
        bump,
        space = AggregatorAccountData::size(),
        payer = payer)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    #[account(
        constraint = function.load()?.enclave.enclave_signer == function_enclave_signer.key(),
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,
    pub function_enclave_signer: Signer<'info>,
    pub verifier: AccountLoader<'info, VerifierAccountData>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorFunctionUpsertParams {
    pub name: [u8; 32],
    pub value: BorshDecimal,
}
impl AggregatorFunctionUpsert<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &AggregatorFunctionUpsertParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<AggregatorFunctionUpsert>, params: &AggregatorFunctionUpsertParams) -> Result<()> {
        let function = ctx.accounts.function.load()?;
        let mut aggregator = ctx.accounts.aggregator.load_init();
        if aggregator.is_err() {
            aggregator = ctx.accounts.aggregator.load_mut();
        }
        let aggregator = &mut aggregator?;
        aggregator.name = params.name;
        aggregator.current_round.is_closed = true;
        aggregator.latest_confirmed_round.is_closed = true;
        aggregator.queue_pubkey = function.attestation_queue;
        aggregator.set_configs(
            params.name,
            [0u8; 128],
            1,
            1,
            1,
            0,
            0,
            Decimal::from(0).into(),
            0,
            0,
            // Is this kosher? Function key could change configs
            &ctx.accounts.function.key(),
        )?;
        let clock = Clock::get()?;
        if aggregator.creation_timestamp == 0 {
            aggregator.creation_timestamp = clock.unix_timestamp;
        }
        aggregator.init_new_round(&clock, &vec![ctx.accounts.verifier.key()]);
        aggregator.current_round.medians_data[0] = params.value.into();
        aggregator.current_round.round_open_slot = clock.slot;
        aggregator.current_round.round_open_timestamp = clock.unix_timestamp;
        aggregator.current_round.medians_fulfilled[0] = true;
        aggregator.current_round.num_success += 1;
        aggregator.current_round.is_closed = true;
        aggregator.current_round.result = params.value.into();
        aggregator.current_round.min_response = params.value.into();
        aggregator.current_round.max_response = params.value.into();
        aggregator.latest_confirmed_round = aggregator.current_round.clone();
        aggregator.parent_function = ctx.accounts.function.key();
        emit!(AggregatorFunctionUpsertEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
            value: params.value,
            timestamp: clock.unix_timestamp,
        });
        Ok(())
    }
}
