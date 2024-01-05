#[cfg(test)]
mod tests;
mod verifier;

trait IVerifierLib<State> {
    fn set_is_on_queue(ref self: State, verifier_id: felt252, value: bool);
    fn assert(self: @State, verifier_id: felt252) -> verifier::Verifier;
    fn get(self: @State, verifier_id: felt252) -> verifier::Verifier;
    fn exists(self: @State, verifier_id: felt252) -> bool;
}

#[starknet::interface]
trait IVerifierLibExternal<State> {
    fn verifier_create(
        ref self: State, params: verifier::VerifierCreateParams
    ) -> verifier::Verifier;
    fn verifier_update(
        ref self: State, params: verifier::VerifierUpdateParams
    ) -> verifier::Verifier;
    fn verifier_get(self: @State, verifier_id: felt252) -> verifier::Verifier;
    fn verifier_is_valid(self: @State, verifier_id: felt252) -> bool;
    fn verifier_heartbeat(ref self: State, verifier_id: felt252) -> verifier::Verifier;
}

#[starknet::component]
mod verifier_lib {
    use alexandria_data_structures::array_ext::SpanTraitExt;
    use sb_attestation_queue::IAttestationQueueLib;
    use sb_attestation_queue::attestation_queue_lib;
    use sb_permissions::IPermissionsLib;
    use sb_permissions::{permissions_lib, permissions::Permission};
    use sb_util::component::{util_lib, IUtilLib};
    use sb_util::guards;
    use super::IVerifierLib;
    use super::IVerifierLibExternal;
    use super::verifier::VerifierCreateParams;
    use super::verifier::VerifierUpdateParams;
    use super::verifier::{Verifier, VerificationStatus};

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        VerifierCreate: VerifierCreate,
        VerifierUpdate: VerifierUpdate,
        VerifierGC: VerifierGC,
    }

    #[derive(Drop, starknet::Event)]
    struct VerifierCreate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
        signer: starknet::ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct VerifierUpdate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
        signer: starknet::ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct VerifierGC {
        #[key]
        gc_verifier_id: felt252,
        #[key]
        attestation_queue_id: felt252,
    }

    #[storage]
    struct Storage {
        // A list where the key is the index, and the value is the id of the routine.
        verifier_ids: LegacyMap<felt252, felt252>,
        verifier_ids_len: felt252,
        verifier_map: LegacyMap<felt252, Verifier>,
    }

    // For now we need to provie a helper to access UtilLib. In the future, helpers will be generated
    // to help components access their dependencies.
    #[generate_trait]
    impl Dependencies<
        TContractState,
        +HasComponent<TContractState>,
        +attestation_queue_lib::HasComponent<TContractState>,
        +permissions_lib::HasComponent<TContractState>,
        +util_lib::HasComponent<TContractState>,
        +Drop<TContractState>
    > of DependenciesTrait<TContractState> {
        fn attestation_queue_lib(
            self: @ComponentState<TContractState>
        ) -> @attestation_queue_lib::ComponentState<TContractState> {
            let mut contract = self.get_contract();
            attestation_queue_lib::HasComponent::get_component(contract)
        }

        fn attestation_queue_lib_mut(
            ref self: ComponentState<TContractState>
        ) -> attestation_queue_lib::ComponentState<TContractState> {
            let mut contract = self.get_contract_mut();
            attestation_queue_lib::HasComponent::get_component_mut(ref contract)
        }

        fn permissions_lib(
            ref self: ComponentState<TContractState>
        ) -> permissions_lib::ComponentState<TContractState> {
            let mut contract = self.get_contract_mut();
            permissions_lib::HasComponent::get_component_mut(ref contract)
        }

        fn generate_id(ref self: ComponentState<TContractState>) -> felt252 {
            let mut contract = self.get_contract_mut();
            let mut util = util_lib::HasComponent::get_component_mut(ref contract);
            util.generate_id()
        }
    }

    impl VerifierLib<
        TContractState, +HasComponent<TContractState>
    > of super::IVerifierLib<ComponentState<TContractState>> {
        fn set_is_on_queue(
            ref self: ComponentState<TContractState>, verifier_id: felt252, value: bool
        ) {
            let mut account = self.assert(verifier_id);
            account.is_on_queue = value;
            self.verifier_map.write(verifier_id, account);
        }

        fn assert(self: @ComponentState<TContractState>, verifier_id: felt252) -> Verifier {
            assert(self.exists(verifier_id), 'VerifierNotFound');
            self.get(verifier_id)
        }

        fn get(self: @ComponentState<TContractState>, verifier_id: felt252) -> Verifier {
            self.verifier_map.read(verifier_id)
        }

        fn exists(self: @ComponentState<TContractState>, verifier_id: felt252) -> bool {
            self.get(verifier_id).id != 0
        }
    }

    #[embeddable_as(VerifierExternalImpl)]
    impl External<
        TContractState,
        +HasComponent<TContractState>,
        +attestation_queue_lib::HasComponent<TContractState>,
        +permissions_lib::HasComponent<TContractState>,
        +util_lib::HasComponent<TContractState>,
        +Drop<TContractState>,
    > of super::IVerifierLibExternal<ComponentState<TContractState>> {
        fn verifier_create(
            ref self: ComponentState<TContractState>, params: VerifierCreateParams
        ) -> Verifier {
            let id = self.generate_id();
            assert(!self.exists(id), 'AttQueueAlreadyExists');

            let now_timestamp = starknet::info::get_block_timestamp();
            // Make the account.
            let account = Verifier {
                id: id,
                authority: params.authority,
                signer: params.signer,
                cid: array![].span(),
                attestation_queue_id: params.attestation_queue_id,
                created_at: now_timestamp,
                updated_at: now_timestamp,
                last_heartbeat_at: 0,
                is_on_queue: false,
                verification_status: VerificationStatus::Failure,
                verification_timestamp: now_timestamp,
                verification_valid_until: 0,
                mr_enclave: 0,
                balance: 0,
            };
            // Write the new account to the account store.
            self.verifier_map.write(id, account);
            // Add the new ID to the list of known Verifier and increment the len.
            self.verifier_ids.write(self.verifier_ids_len.read(), id);
            self.verifier_ids_len.write(self.verifier_ids_len.read() + 1);
            // Emit an VerifierCreate event.
            let event = VerifierCreate { id, authority: params.authority, signer: params.signer };
            self.emit(Event::VerifierCreate(event));
            account
        }

        fn verifier_update(
            ref self: ComponentState<TContractState>, params: VerifierUpdateParams
        ) -> Verifier {
            let id = params.id;
            let mut account = self.assert(id);
            guards::check_authority(account.authority);

            // Make the account modifications.
            account.authority = params.authority;
            account.signer = params.signer;
            account.attestation_queue_id = params.attestation_queue_id;
            account.verification_status = VerificationStatus::Failure;
            account.updated_at = starknet::info::get_block_timestamp();
            // Write the new account to the account store.
            self.verifier_map.write(id, account);
            // Emit an VerifierUpdate event.
            let event = VerifierUpdate { id, authority: params.authority, signer: params.signer };
            self.emit(Event::VerifierUpdate(event));
            account
        }

        fn verifier_get(self: @ComponentState<TContractState>, verifier_id: felt252) -> Verifier {
            self.assert(verifier_id)
        }

        fn verifier_is_valid(self: @ComponentState<TContractState>, verifier_id: felt252) -> bool {
            let verifier = self.assert(verifier_id);
            let queue = self.attestation_queue_lib().assert(verifier.attestation_queue_id);
            let timestamp = starknet::get_block_timestamp();
            if verifier.verification_status == VerificationStatus::Override {
                true
            } else if verifier.verification_status != VerificationStatus::Success {
                false
            } else if verifier.verification_valid_until < timestamp {
                false
            } else if !queue.mr_enclaves.contains(verifier.mr_enclave) {
                false
            } else {
                true
            }
        }

        fn verifier_heartbeat(
            ref self: ComponentState<TContractState>, verifier_id: felt252
        ) -> Verifier {
            let mut verifier = self.assert(verifier_id);
            assert(starknet::get_caller_address() == verifier.signer, 'InvalidSigner');

            let queue = self.attestation_queue_lib().assert(verifier.attestation_queue_id);
            let timestamp = starknet::get_block_timestamp();
            if queue.require_heartbeat_permission {
                assert(
                    self.permissions_lib().has(queue.id, verifier.id, Permission::Heartbeat),
                    'PermissionDenied'
                )
            } else if queue.allow_authority_overide_after > 0 && timestamp
                - verifier.last_heartbeat_at > queue.allow_authority_overide_after {
                assert(
                    verifier.verification_status == VerificationStatus::Override, 'InvalidStatus'
                );
                assert(verifier.verification_valid_until >= timestamp, 'VerifierExpired');
            }
            assert(self.verifier_is_valid(verifier.id), 'InvalidVerifier');

            let mut attestation_queue_lib = self.attestation_queue_lib_mut();
            attestation_queue_lib.set_last_heartbeat(verifier.attestation_queue_id);
            verifier.last_heartbeat_at = timestamp;

            if !verifier.is_on_queue {
                verifier.is_on_queue = true;
                attestation_queue_lib.push(verifier.attestation_queue_id, verifier_id);
            }

            // Write the updated verifier to storage.
            self.verifier_map.write(verifier_id, verifier);

            let gc_verifier_id = queue.verifiers.at(queue.gc_idx);
            let gc_verifier = self.assert(*gc_verifier_id);
            attestation_queue_lib.increment_gc(verifier.attestation_queue_id);

            if gc_verifier.last_heartbeat_at + queue.verifier_timeout < timestamp {
                self.set_is_on_queue(gc_verifier.id, false);
                attestation_queue_lib.remove_verifier(verifier.attestation_queue_id, gc_verifier.id);

                let event = VerifierGC {
                    gc_verifier_id: gc_verifier.id, attestation_queue_id: queue.id
                };
                self.emit(Event::VerifierGC(event));
            }

            verifier
        }
    }
}
