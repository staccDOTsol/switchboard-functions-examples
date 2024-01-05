use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: CrankInitParams)] // rpc parameters hint
pub struct CrankInit<'info> {
    #[account(init, payer = payer, space = CrankAccountData::size())]
    pub crank: AccountLoader<'info, CrankAccountData>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: todo
    #[account(mut)]
    pub buffer: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct CrankInitParams {
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub crank_size: u32,
}
impl CrankInit<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &CrankInitParams) -> Result<()> {
        assert_safe_zeroed(ctx.program_id, &ctx.accounts.buffer)?;
        // Trigger queue discriminator check
        ctx.accounts.queue.load()?;
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &CrankInitParams) -> Result<()> {
        ctx.accounts.buffer.try_borrow_mut_data()?[..8].clone_from_slice(BUFFER_DISCRIMINATOR);
        let mut crank = ctx.accounts.crank.load_init()?;
        let mut name = params.name.clone();
        let mut metadata = params.metadata.clone();
        let buffer_account_info = ctx.accounts.buffer.to_account_info();
        let buffer = buffer_account_info.try_borrow_data()?;
        let size = buffer[8..].len() / std::mem::size_of::<CrankRow>();
        crank.data_buffer = ctx.accounts.buffer.key();
        name.resize(32, 0u8);
        metadata.resize(64, 0u8);
        crank.name.clone_from_slice(name.as_slice());
        crank.metadata.clone_from_slice(metadata.as_slice());
        crank.queue_pubkey = ctx.accounts.queue.key();
        crank.max_rows = size.try_into().unwrap();
        Ok(())
    }
}
