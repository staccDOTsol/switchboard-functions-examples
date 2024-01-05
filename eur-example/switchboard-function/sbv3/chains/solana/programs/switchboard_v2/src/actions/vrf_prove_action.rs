use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: VrfProveParams)] // rpc parameters hint
pub struct VrfProve<'info> {
    #[account(mut)]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    #[account(constraint = oracle.load()?.oracle_authority == randomness_producer.key()
        @ SwitchboardError::InvalidAuthorityError)]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    pub randomness_producer: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfProveParams {
    pub proof: Vec<u8>,
    pub idx: u32,
}
impl VrfProve<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &VrfProveParams) -> Result<()> {
        let idx = params.idx as usize;
        let vrf = ctx.accounts.vrf.load()?;
        if params.idx > 8 || params.idx >= vrf.batch_size {
            return Err(error!(SwitchboardError::IndexOutOfBoundsError));
        }
        if vrf.builders[idx].producer != ctx.accounts.oracle.key() {
            return Err(error!(SwitchboardError::InvalidVrfProducerError));
        }
        if vrf.builders[idx].status != VrfStatus::StatusRequesting {
            return Err(error!(SwitchboardError::VrfInvalidProofSubmissionError));
        }
        Ok(())
    }

    pub fn actuate(ctx: &Context<VrfProve>, params: &VrfProveParams) -> Result<()> {
        let mut vrf = ctx.accounts.vrf.load_mut()?;
        let idx = params.idx as usize;
        vrf.builders[idx]
            .repr_proof
            .clone_from_slice(&params.proof[..80]);
        if vrf.status == VrfStatus::StatusRequesting {
            vrf.status = VrfStatus::StatusVerifying;
        }
        vrf.builders[idx].status = VrfStatus::StatusVerifying;
        emit!(VrfProveEvent {
            vrf_pubkey: ctx.accounts.vrf.key(),
            oracle_pubkey: ctx.accounts.oracle.key(),
            authority_pubkey: ctx.accounts.randomness_producer.key(),
        });
        Ok(())
    }
}
