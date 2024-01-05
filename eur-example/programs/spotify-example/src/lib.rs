#![allow(clippy::result_large_err)]
// Program: Solana TWAP Oracle
// This Solana program will allow you to peridoically relay information from EtherPrices to your
// program and store in an account. When a user interacts with our program they will reference
// the price from the previous push.
// - initialize:        Initializes the program and creates the accounts.
// - set_function:      Sets the Switchboard Function for our program. This is the only function
//                      allowed to push data to our program.
// - refresh_oracle:    This is the instruction our Switchboard Function will emit to update
//                      our oracle prices.
// - trigger_function:  Our Switchboard Function will be configured to push data on a pre-defined
//                      schedule. This instruction will allow us to manually request a new price
//                      from the off-chain oracles.

pub use switchboard_solana::prelude::*;


declare_id!("BUhaGyJbdbfV24BiW2GPjtqeUhkMZ2E9bYuu34pB8YEs");

pub const PROGRAM_SEED: &[u8] = b"SPOTIFY_EXAMPLE";
pub const ORACLE_SEED: &[u8] = b"SPOTIFY_EXAMPLE_ORACLE";

fn from_u8_array(input: &[u8; 512]) -> String {
    let mut array = [0u8; 512];
    array.copy_from_slice(&input[..]);
    String::from_utf8(array.to_vec()).unwrap()
}

#[program]
pub mod spotify_example {

    use super::*;

    pub fn get_artists(ctx: Context<GetArtists>) -> anchor_lang::Result<String> {
        let oracle = &ctx.accounts.oracle.load()?;
        let artists = from_u8_array(&oracle.top_spotify_artists);
        Ok(artists)
    }

    pub fn initialize(ctx: Context<Initialize>, bump: u8, bump2: u8) -> anchor_lang::Result<()> {
        let program = &mut ctx.accounts.program.load_init()?; // initally load_init
        program.bump = bump;
        program.authority = ctx.accounts.authority.key();
    
        // Optionally set the switchboard_function if provided
        program.switchboard_function = ctx.accounts.switchboard_function.key();
    
        let oracle = &mut ctx.accounts.oracle.load_init()?;
        oracle.authority = ctx.accounts.authority.key();
        oracle.bump = bump2;
    
        Ok(())
    }
    pub fn set_artists(
        ctx: Context<SetArtists>,
        params: SetArtistsParams,
    ) -> anchor_lang::Result<()> {
        let oracle = &mut ctx.accounts.oracle.load_mut()?;
        msg!("saving oracle data");
        
        oracle.top_spotify_artists = params.artists;
        println!("artists for {:?}: {:?}", oracle.authority, oracle.top_spotify_artists);
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct GetArtists<'info> {
    #[account(mut)]
    pub oracle: AccountLoader<'info, MyOracleState>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init_if_needed,
        space = 8 + std::mem::size_of::<MyProgramState>(),
        payer = payer,
        seeds = [PROGRAM_SEED, switchboard_function.key().as_ref()],
        bump
    )]
    pub program: AccountLoader<'info, MyProgramState>,

    #[account(
        init_if_needed,
        space = 8 + std::mem::size_of::<MyOracleState>(),
        payer = payer,
        seeds = [ORACLE_SEED, switchboard_function.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub oracle: AccountLoader<'info, MyOracleState>,
    /// CHECK:
    pub authority: AccountInfo<'info>,

    pub switchboard_function: AccountLoader<'info, FunctionAccountData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}



#[derive(Accounts)]
#[instruction(params: SetArtistsParams)] // rpc parameters hint
pub struct SetArtists<'info> {
    // We need this to validate that the Switchboard Function passed to our program
    // is the expected one.
    #[account(
        seeds = [PROGRAM_SEED, switchboard_function.key().as_ref()],
        bump = program.load()?.bump,
        has_one = switchboard_function
    )]
    pub program: AccountLoader<'info, MyProgramState>,

    #[account(
        mut,
        seeds =  [ORACLE_SEED, switchboard_function.key().as_ref(), oracle.load()?.authority.as_ref()],
        bump = oracle.load()?.bump
    )]
    pub oracle: AccountLoader<'info, MyOracleState>,

    // We use this to verify the functions enclave state was verified successfully
   #[account(
    constraint =
                switchboard_function.load()?.validate(
                &enclave_signer.to_account_info()
            )? @ SpotifyExampleError::FunctionValidationFailed     
    )]
    pub switchboard_function: AccountLoader<'info, FunctionAccountData>,
    pub enclave_signer: Signer<'info>,
}
#[account(zero_copy)]
pub struct MyProgramState {
    pub bump: u8,
    pub authority: Pubkey,
    pub switchboard_function: Pubkey,
    pub _buffer: [u8; 512],
}
#[account(zero_copy)]
pub struct MyOracleState {
    pub bump: u8, 
    pub authority: Pubkey,
    pub top_spotify_artists: [u8; 512],
    pub _buffer: [u8; 32],

}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetArtistsParams {
    pub artists: [u8; 512],
}

#[error_code]
#[derive(Eq, PartialEq)]
pub enum SpotifyExampleError {
    #[msg("Invalid authority account")]
    InvalidAuthority,
    #[msg("Array overflow")]
    ArrayOverflow,
    #[msg("Stale data")]
    StaleData,
    #[msg("Invalid trusted signer")]
    InvalidTrustedSigner,
    #[msg("Invalid MRENCLAVE")]
    InvalidMrEnclave,
    #[msg("Failed to find a valid trading symbol for this price")]
    InvalidSymbol,
    #[msg("FunctionAccount pubkey did not match program_state.function")]
    IncorrectSwitchboardFunction,
    #[msg("FunctionAccount pubkey did not match program_state.function")]
    InvalidSwitchboardFunction,
    #[msg("FunctionAccount was not validated successfully")]
    FunctionValidationFailed,
}
