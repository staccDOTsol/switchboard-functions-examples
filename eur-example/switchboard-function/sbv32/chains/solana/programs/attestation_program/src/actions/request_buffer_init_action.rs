// use crate::*;

// use anchor_lang::prelude::*;
// use anchor_spl::token::Mint;
// use anchor_spl::token::Token;

// #[derive(Accounts)]
// #[instruction(params: FunctionRequestBufferInitParams)] // rpc parameters hint
// pub struct FunctionRequestBufferInit<'info> {
//     #[account(
//         zero,
//         constraint =
//             buffer.to_account_info().data_len() ==
//                 FunctionRequestBufferAccountData::space(params.row_params_len, params.max_rows)
//     )]
//     pub buffer: AccountLoader<'info, FunctionRequestBufferAccountData>,

//     /// CHECK: the authority of the routine
//     pub authority: Signer<'info>,

//     #[account(
//         mut,
//         has_one = attestation_queue @ SwitchboardError::InvalidQueue,
//         has_one = authority @ SwitchboardError::InvalidAuthority,
//     )]
//     pub function: AccountLoader<'info, FunctionAccountData>,

//     #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
//     pub mint: Box<Account<'info, Mint>>,

//     pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

//     #[account(mut)]
//     pub payer: Signer<'info>,

//     pub system_program: Program<'info, System>,

//     pub token_program: Program<'info, Token>,

//     pub associated_token_program: Program<'info, AssociatedToken>,
// }

// #[derive(Clone, AnchorSerialize, AnchorDeserialize)]
// pub struct FunctionRequestBufferInitParams {
//     pub row_params_len: u32,
//     pub max_rows: u32,
//     pub min_interval: u32,
// }

// impl FunctionRequestBufferInit<'_> {
//     pub fn validate(
//         &self,
//         ctx: &Context<Self>,
//         _params: &FunctionRequestBufferInitParams,
//     ) -> Result<()> {
//         let attestation_queue = ctx.accounts.attestation_queue.load()?;
//         attestation_queue.assert_is_ready()?;

//         let func = ctx.accounts.function.load()?;
//         func.ready_for_requests()?;
//         // func.assert_optional_routine_authority(&ctx.accounts.function_authority)?;
//         func.assert_permissions(attestation_queue.require_usage_permissions)?;

//         Ok(())
//     }

//     pub fn actuate(
//         ctx: &mut Context<Self>,
//         params: &FunctionRequestBufferInitParams,
//     ) -> Result<()> {
//         // // Initialize the wallet if we need to
//         // let mut wallet = SwitchboardWallet::init_if_needed(
//         //     ctx.accounts.into(),
//         //     ctx.accounts.routine.key().to_bytes().to_vec(),
//         // )?;
//         // wallet.assert_new_resource_authority(
//         //     &ctx.accounts.authority,
//         //     &ctx.accounts.escrow_wallet_authority,
//         // )?;
//         // wallet.add_resource()?;
//         // wallet.exit(&switchboard_attestation_program::ID)?; // persist account changes
//         // drop(wallet);

//         // Increment the number of routines on the function account
//         let func = &mut ctx.accounts.function.load_mut()?;

//         let buf = &mut ctx.accounts.buffer.load_mut()?;
//         buf.max_rows = params.max_rows;
//         buf.row_params_len = params.row_params_len;
//         buf.min_interval = params.min_interval;

//         Ok(())
//     }
// }
