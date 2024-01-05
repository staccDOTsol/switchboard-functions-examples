use crate::*;
use ethers::prelude::*;
pub mod switchboard;
pub use switchboard::*;
pub mod eip712;
pub use eip712::*;
pub mod forward;
pub use forward::*;

use ethers::core::k256::ecdsa::SigningKey;
use ethers::core::types::TransactionRequest;
use ethers::providers::PendingTransaction;
pub use ethers::utils::WEI_IN_ETHER;

// type EVMMiddleware<T> = SignerMiddleware<Provider<T>, Wallet<SigningKey>>;
//
// pub async fn transfer_wei<'a, T: JsonRpcClient + Clone>(
//     client: &'a EVMMiddleware<T>,
//     to: &H160,
//     wei: U256,
// ) -> std::result::Result<PendingTransaction<'a, T>, Err> {
//     // amount to send in wei
//     // create a transaction
//     let tx = TransactionRequest::new().to(*to).value(wei);
//
//     // sign and send the transaction
//     let pending_tx = client
//         .send_transaction(tx, None)
//         .await
//         .unwrap()
//         .log_msg("Funds being sent to Node Wallet");
//
//     Ok(pending_tx)
// }
