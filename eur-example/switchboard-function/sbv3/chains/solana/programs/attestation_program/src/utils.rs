pub use crate::*;

use anchor_spl::token::TokenAccount;

// use anchor_lang::system_program::Transfer;

pub fn transfer<'a>(
    token_program: &AccountInfo<'a>,
    from: &Account<'a, TokenAccount>,
    to: &Account<'a, TokenAccount>,
    authority: &AccountInfo<'a>,
    auth_seed: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let cpi_program = token_program.clone();
    let cpi_accounts = anchor_spl::token::Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.clone(),
    };
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, auth_seed);
    token::transfer(cpi_ctx, amount)?;
    Ok(())
}

pub fn wrap_native<'a>(
    system_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    native_token_account: &Account<'a, TokenAccount>,
    payer: &AccountInfo<'a>,
    auth_seed: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    if native_token_account.mint != anchor_spl::token::spl_token::native_mint::ID {
        return Err(error!(SwitchboardError::InvalidEscrow));
    }

    // first transfer the SOL to the token account
    let transfer_accounts = anchor_lang::system_program::Transfer {
        from: payer.to_account_info(),
        to: native_token_account.to_account_info(),
    };
    let transfer_ctx = CpiContext::new(system_program.clone(), transfer_accounts);
    anchor_lang::system_program::transfer(transfer_ctx, amount)?;

    // then call sync native which
    let sync_accounts = anchor_spl::token::SyncNative {
        account: native_token_account.to_account_info(),
    };
    let sync_ctx = CpiContext::new_with_signer(token_program.clone(), sync_accounts, auth_seed);
    anchor_spl::token::sync_native(sync_ctx)?;

    Ok(())
}

pub fn parse_mr_enclaves(enclaves: &Vec<[u8; 32]>) -> anchor_lang::Result<[[u8; 32]; 32]> {
    if enclaves.len() > 32 {
        return Err(error!(SwitchboardError::IllegalExecuteAttempt));
    }
    let mut result: [[u8; 32]; 32] = [[0; 32]; 32];

    for (i, enclave) in enclaves.iter().enumerate() {
        result[i] = *enclave;
    }

    Ok(result)
}

pub fn find_associated_token_address(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let (akey, _bump) = Pubkey::find_program_address(
        &[
            owner.as_ref(),
            anchor_spl::token::ID.as_ref(),
            mint.as_ref(),
        ],
        &anchor_spl::associated_token::ID,
    );
    akey
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_mr_enclaves_success() {
        let enclaves: Vec<[u8; 32]> = vec![[1; 32]; 10];
        let result = parse_mr_enclaves(&enclaves).unwrap();

        // Check first 10 elements are [1; 32]
        for i in 0..10 {
            assert_eq!(result[i], [1; 32]);
        }

        // Check the remaining elements are [0; 32] (default)
        for i in 10..32 {
            assert_eq!(result[i], [0; 32]);
        }
    }

    // #[test]
    // fn test_parse_mr_enclaves_overflow() {
    //     let enclaves: Vec<[u8; 32]> = vec![[1; 32]; 33];
    //     match parse_mr_enclaves(&enclaves) {
    //         Err(BasicOracleError::ArrayOverflow) => {} // test passes
    //         _ => panic!("Unexpected result"),          // test fails
    //     };
    // }
}
