use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(Accounts)]
#[instruction(params: ProgramConfigParams)] // rpc parameters hint
pub struct ProgramConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [STATE_SEED], bump = params.bump,
        has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub program_state: AccountLoader<'info, SbState>,
    pub dao_mint: Account<'info, Mint>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProgramConfigParams {
    pub token: Pubkey,
    pub bump: u8,
    pub dao_mint: Pubkey,
    pub add_enclaves: Vec<[u8; 32]>,
    pub rm_enclaves: Vec<[u8; 32]>,
}
impl ProgramConfig<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &ProgramConfigParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<ProgramConfig>, params: &ProgramConfigParams) -> Result<()> {
        let mut state = ctx.accounts.program_state.load_mut()?;
        // state.dao_mint = ctx.accounts.dao_mint.key();
        let add_enclaves = &params.add_enclaves;
        let mut mr_enclaves = state.mr_enclaves.to_vec();
        mr_enclaves.extend(add_enclaves);
        mr_enclaves.retain(|&x| !params.rm_enclaves.iter().any(|&y| y == x));
        mr_enclaves.retain(|&x| x != [0; 32]);
        mr_enclaves.resize(6, [0; 32]);
        state.mr_enclaves = mr_enclaves.try_into().unwrap();
        Ok(())
    }
}
