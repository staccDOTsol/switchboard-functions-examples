use starknet::class_hash::{ClassHash, ClassHashZeroable};
use starknet::contract_address::{ContractAddress, ContractAddressZeroable};

// Asserts that the current caller is the listed authority of the Switchboard contact.
//
// If the listed authority is unset (0), do nothing.
//
// Returns the caller if they are able to act as the authority
fn assert_switchboard_authority(cur_authority: ContractAddress) -> ContractAddress {
    let caller = starknet::get_caller_address();
    // If the authority has been set (is non-zero), the contract is not guarded by an authority.
    if (ContractAddressZeroable::is_non_zero(cur_authority)) {
        assert(cur_authority == caller, 'SbAuthorityMismatchError');
    }
    return caller;
}

#[starknet::interface]
trait ICoreSwitchboard<TState> {
    // ╔═════════════════════════════════════════════╗
    // ║  EXTERNAL                                   ║
    // ╚═════════════════════════════════════════════╝
    fn set_authority(ref self: TState, to: ContractAddress);
    fn set_class_hash(ref self: TState, to: ClassHash);

    // ╔═════════════════════════════════════════════╗
    // ║  VIEW                                       ║
    // ╚═════════════════════════════════════════════╝
    fn get_authority(self: @TState) -> ContractAddress;
}

#[starknet::contract]
mod Switchboard {
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use sb_attestation_queue::attestation_queue_lib as attestation_queue_lib;
    use sb_function::function_lib as function_lib;
    use sb_permissions::permissions_lib as permissions_lib;
    use sb_request::request_lib as request_lib;
    use sb_routine::routine_lib as routine_lib;
    use sb_util::component::util_lib as util_lib;
    use sb_verifier::verifier_lib as verifier_lib;
    use super::ICoreSwitchboard;
    use super::{ClassHash, ClassHashZeroable};
    use super::{ContractAddress, ContractAddressZeroable};

    component!(
        path: attestation_queue_lib,
        storage: attestation_queue_storage,
        event: AttestationQueueLibEvent
    );
    component!(path: function_lib, storage: function_storage, event: FunctionLibEvent);
    component!(path: permissions_lib, storage: permissions_storage, event: PermissionsLibEvent);
    component!(path: request_lib, storage: request_storage, event: RequestLibEvent);
    component!(path: routine_lib, storage: routine_storage, event: RoutineLibEvent);
    component!(path: util_lib, storage: util_storage, event: UtilLibEvent);
    component!(path: verifier_lib, storage: verifier_storage, event: VerifierLibEvent);

    component!(
        path: ReentrancyGuardComponent,
        storage: reentrancy_guard_storage,
        event: ReentrancyGuardEvent
    );

    impl AttestationQueueLib = attestation_queue_lib::AttestationQueueLib<ContractState>;
    #[abi(embed_v0)]
    impl AttestationQueueLibExternal =
        attestation_queue_lib::AttestationQueueExternalImpl<ContractState>;
    impl FunctionLib = function_lib::FunctionLib<ContractState>;
    #[abi(embed_v0)]
    impl FunctionExternal = function_lib::FunctionExternalImpl<ContractState>;
    impl RequestLib = request_lib::RequestLib<ContractState>;
    #[abi(embed_v0)]
    impl RequestExternal = request_lib::RequestExternalImpl<ContractState>;
    impl RoutineLib = routine_lib::RoutineLib<ContractState>;
    #[abi(embed_v0)]
    impl RoutineExternal = routine_lib::RoutineExternalImpl<ContractState>;
    impl UtilLib = util_lib::UtilLib<ContractState>;
    impl VerifierLib = verifier_lib::VerifierLib<ContractState>;
    #[abi(embed_v0)]
    impl VerifierExternal = verifier_lib::VerifierExternalImpl<ContractState>;


    // ╔═════════════════════════════════════════════╗
    // ║  EVENTS                                     ║
    // ╚═════════════════════════════════════════════╝

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        AuthorityUpdated: AuthorityUpdated,
        ContractUpgraded: ContractUpgraded,
        #[flat]
        AttestationQueueLibEvent: attestation_queue_lib::Event,
        #[flat]
        FunctionLibEvent: function_lib::Event,
        #[flat]
        PermissionsLibEvent: permissions_lib::Event,
        #[flat]
        RequestLibEvent: request_lib::Event,
        #[flat]
        RoutineLibEvent: routine_lib::Event,
        #[flat]
        UtilLibEvent: util_lib::Event,
        #[flat]
        VerifierLibEvent: verifier_lib::Event,
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event
    }

    #[derive(Drop, starknet::Event)]
    struct AuthorityUpdated {
        #[key]
        by: ContractAddress,
        #[key]
        to: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct ContractUpgraded {
        #[key]
        by: ContractAddress,
        from: ClassHash,
        to: ClassHash,
    }

    // ╔═════════════════════════════════════════════╗
    // ║  STORAGE                                    ║
    // ╚═════════════════════════════════════════════╝

    #[storage]
    struct Storage {
        // The authority of the Switchboard contract is the only caller authorized to perform some
        // types of actions (such as upgrading the contract).
        authority: ContractAddress,
        // The current class hash of the Switchboard contract.
        contract_class_hash: ClassHash,
        #[substorage(v0)]
        attestation_queue_storage: attestation_queue_lib::Storage,
        #[substorage(v0)]
        function_storage: function_lib::Storage,
        #[substorage(v0)]
        permissions_storage: permissions_lib::Storage,
        #[substorage(v0)]
        request_storage: request_lib::Storage,
        #[substorage(v0)]
        routine_storage: routine_lib::Storage,
        #[substorage(v0)]
        util_storage: util_lib::Storage,
        #[substorage(v0)]
        verifier_storage: verifier_lib::Storage,
        #[substorage(v0)]
        reentrancy_guard_storage: ReentrancyGuardComponent::Storage,
    }

    // ╔═════════════════════════════════════════════╗
    // ║  CONSTRUCTOR                                ║
    // ╚═════════════════════════════════════════════╝

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.set_authority(starknet::get_caller_address());
    }

    #[external(v0)]
    impl CoreSwitchboard of super::ICoreSwitchboard<ContractState> {
        fn set_authority(ref self: ContractState, to: ContractAddress) {
            // Assert that `caller` is the qualified Switchboard authority.
            let by = super::assert_switchboard_authority(self.authority.read());
            // Upgrade the authority.
            self.authority.write(to);
            // Emit an AuthorityUpdated event.
            self.emit(Event::AuthorityUpdated(AuthorityUpdated { by, to }));
        }

        fn set_class_hash(ref self: ContractState, to: ClassHash) {
            // Assert that `to` ClassHash is non-zero.
            assert(ClassHashZeroable::is_non_zero(to), 'ClassHashIsZeroError');
            // Assert that `caller` is the qualified Switchboard authority.
            let by = super::assert_switchboard_authority(self.authority.read());
            // Upgrade the contract.
            let from = self.contract_class_hash.read();
            self.contract_class_hash.write(to);
            starknet::replace_class_syscall(to).unwrap();
            // Emit an ContractUpgraded event.
            self.emit(Event::ContractUpgraded(ContractUpgraded { by, from, to }));
        }

        fn get_authority(self: @ContractState) -> ContractAddress {
            return self.authority.read();
        }
    }
}
