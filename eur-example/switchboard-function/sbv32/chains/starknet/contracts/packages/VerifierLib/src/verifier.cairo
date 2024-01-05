use sb_util::span::StoreSpan;
use starknet::ContractAddress;

#[derive(Copy, Drop, PartialEq, Serde, starknet::Store)]
enum VerificationStatus {
    #[default]
    Failure,
    Pending,
    Success,
    Override,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
struct Verifier {
    // The identifier of this verifier.
    id: felt252,
    // The caller who is allowed to update the config of this verifier.
    authority: ContractAddress,
    // The enclave signer public key for this Verifier.
    signer: ContractAddress,
    // IPFS hash of the quote where the verifiers signer was rotated.
    cid: Span<felt252>,
    // The AttestationQueue that this Verifier is attached to.
    attestation_queue_id: felt252,
    // The timestamp at which the verifier was created.
    created_at: u64,
    // The timestamp at which the verifier's config was last updated.
    updated_at: u64,
    // The timestamp at which the verifier last heartbeated.
    last_heartbeat_at: u64,
    // Whether the Verifier is located on the AttestationQueues buffer.
    is_on_queue: bool,
    // This verifiers current status.
    verification_status: VerificationStatus,
    // The timestamp that the Verifier was last verified.
    verification_timestamp: u64,
    // The timestamp that the `verification_status` is valid until.
    verification_valid_until: u64,
    // TODO: document this field.
    mr_enclave: u256,
    // The balance held by this Routine.
    balance: u256,
}

#[derive(Copy, Drop, Serde)]
struct VerifierCreateParams {
    authority: ContractAddress,
    signer: ContractAddress,
    attestation_queue_id: felt252,
}

#[derive(Copy, Drop, Serde)]
struct VerifierUpdateParams {
    id: felt252,
    authority: ContractAddress,
    signer: ContractAddress,
    attestation_queue_id: felt252,
}
