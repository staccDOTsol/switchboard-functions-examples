use crate::*;

#[event]
pub struct VrfRequestRandomnessEvent {
    #[index]
    pub vrf_pubkey: Pubkey,
    pub oracle_pubkeys: Vec<Pubkey>,
    pub load_amount: u64,
    pub existing_amount: u64,
    pub alpha: Vec<u8>,
    pub counter: u128,
    // #[index]
    // pub label: String,
}

#[event]
pub struct VrfRequestEvent {
    #[index]
    pub vrf_pubkey: Pubkey,
    pub oracle_pubkeys: Vec<Pubkey>,
}

#[event]
pub struct VrfProveEvent {
    #[index]
    pub vrf_pubkey: Pubkey,
    #[index]
    pub oracle_pubkey: Pubkey,
    pub authority_pubkey: Pubkey,
}

#[event]
pub struct VrfVerifyEvent {
    #[index]
    pub vrf_pubkey: Pubkey,
    #[index]
    pub oracle_pubkey: Pubkey,
    pub authority_pubkey: Pubkey,
    pub amount: u64,
}

#[event]
pub struct VrfCallbackPerformedEvent {
    #[index]
    pub vrf_pubkey: Pubkey,
    #[index]
    pub oracle_pubkey: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AggregatorOpenRoundEvent {
    pub feed_pubkey: Pubkey,
    pub oracle_pubkeys: Vec<Pubkey>,
    pub job_pubkeys: Vec<Pubkey>,
    pub remaining_funds: u64,
    pub queue_authority: Pubkey,
    // #[index]
    // pub label: String,
}

#[derive(Default, Eq, PartialEq, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct BorshDecimal {
    pub mantissa: i128,
    pub scale: u32,
}

#[event]
pub struct AggregatorSaveResultEvent {
    pub feed_pubkey: Pubkey,
    pub value: BorshDecimal,
    pub slot: u64,
    pub timestamp: i64,
    pub oracle_pubkey: Pubkey,
    pub job_values: Vec<Option<BorshDecimal>>,
}

#[event]
pub struct AggregatorTeeSaveResultEvent {
    pub feed_pubkey: Pubkey,
    pub value: BorshDecimal,
    pub slot: u64,
    pub timestamp: i64,
    pub oracle_pubkey: Pubkey,
}

#[event]
pub struct AggregatorValueUpdateEvent {
    pub feed_pubkey: Pubkey,
    pub value: BorshDecimal,
    pub slot: u64,
    pub timestamp: i64,
    pub oracle_pubkeys: Vec<Pubkey>,
    pub oracle_values: Vec<BorshDecimal>,
}

#[event]
pub struct OracleRewardEvent {
    pub feed_pubkey: Pubkey,
    pub lease_pubkey: Pubkey,
    pub oracle_pubkey: Pubkey,
    pub wallet_pubkey: Pubkey,
    pub amount: u64,
    pub round_slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct OracleWithdrawEvent {
    pub oracle_pubkey: Pubkey,
    pub wallet_pubkey: Pubkey,
    pub destination_wallet: Pubkey,
    pub previous_amount: u64,
    pub new_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct LeaseWithdrawEvent {
    pub lease_pubkey: Pubkey,
    pub wallet_pubkey: Pubkey,
    pub previous_amount: u64,
    pub new_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct OracleSlashEvent {
    pub feed_pubkey: Pubkey,
    pub lease_pubkey: Pubkey,
    pub oracle_pubkey: Pubkey,
    pub wallet_pubkey: Pubkey,
    pub amount: u64,
    pub round_slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct LeaseFundEvent {
    pub lease_pubkey: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ProbationBrokenEvent {
    pub feed_pubkey: Pubkey,
    pub queue_pubkey: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct FeedPermissionRevokedEvent {
    pub feed_pubkey: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct GarbageCollectFailureEvent {
    pub queue_pubkey: Pubkey,
}

#[event]
pub struct OracleBootedEvent {
    pub queue_pubkey: Pubkey,
    pub oracle_pubkey: Pubkey,
}

#[event]
pub struct AggregatorCrankEvictionEvent {
    pub crank_pubkey: Pubkey,
    #[index]
    pub aggregator_pubkey: Pubkey,
    pub reason: Option<u32>,
    pub timestamp: i64,
}

#[event]
pub struct CrankLeaseInsufficientFundsEvent {
    pub feed_pubkey: Pubkey,
    pub lease_pubkey: Pubkey,
}

#[event]
pub struct CrankPopExpectedFailureEvent {
    pub feed_pubkey: Pubkey,
    pub lease_pubkey: Pubkey,
}

#[event]
pub struct BufferRelayerOpenRoundEvent {
    pub relayer_pubkey: Pubkey,
    pub job_pubkey: Pubkey,
    pub oracle_pubkeys: Vec<Pubkey>,
    pub remaining_funds: u64,
    pub queue: Pubkey,
}

#[event]
pub struct PriorityFeeReimburseEvent {
    pub feed_pubkey: Pubkey,
    pub slot: u64,
    pub timestamp: i64,
    pub fee: u64,
}

#[event]
pub struct AggregatorAddJobEvent {
    pub feed_pubkey: Pubkey,
    pub job_pubkey: Pubkey,
}

#[event]
pub struct AggregatorRemoveJobEvent {
    pub feed_pubkey: Pubkey,
    pub job_pubkey: Pubkey,
}

#[event]
pub struct AggregatorLockEvent {
    pub feed_pubkey: Pubkey,
}

#[event]
pub struct AggregatorInitEvent {
    pub feed_pubkey: Pubkey,
}

#[event]
pub struct AggregatorSetAuthorityEvent {
    pub feed_pubkey: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct AggregatorSetConfigsEvent {
    pub feed_pubkey: Pubkey,
}

#[event]
pub struct PermissionSetEvent {
    pub permission_key: Pubkey,
    pub permission: SwitchboardPermission,
    pub enable: bool,
}

#[event]
pub struct VrfPoolUpdateEvent {
    pub queue_pubkey: Pubkey,
    pub vrf_pool_pubkey: Pubkey,
    pub vrf_pubkey: Pubkey,
    pub new_size: u32,
    pub min_interval: u32,
}

#[event]
pub struct VrfPoolRequestEvent {
    pub queue_pubkey: Pubkey,
    pub vrf_pool_pubkey: Pubkey,
    pub vrf_pubkey: Pubkey,
    pub oracle_pubkey: Pubkey,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct QuoteVerifyRequestEvent {
    pub quote_pubkey: Pubkey,
}

#[event]
pub struct AggregatorFunctionUpsertEvent {
    pub feed_pubkey: Pubkey,
    pub value: BorshDecimal,
    pub timestamp: i64,
}
