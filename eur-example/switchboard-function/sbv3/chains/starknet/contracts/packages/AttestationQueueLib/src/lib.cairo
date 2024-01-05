mod attestation_queue;

#[cfg(test)]
mod tests;

#[starknet::interface]
trait IAttestationQueueLib<State> {
    fn set_last_heartbeat(ref self: State, attestation_queue_id: felt252);
    fn increment_gc(ref self: State, attestation_queue_id: felt252);
    fn increment_cur_idx(ref self: State, attestation_queue_id: felt252);
    fn remove_verifier(ref self: State, attestation_queue_id: felt252, verifier_id: felt252);
    fn push(ref self: State, attestation_queue_id: felt252, verifier_id: felt252);
    fn assert(self: @State, attestation_queue_id: felt252) -> attestation_queue::AttestationQueue;
    fn get(self: @State, attestation_queue_id: felt252) -> attestation_queue::AttestationQueue;
    fn exists(self: @State, attestation_queue_id: felt252) -> bool;
}

#[starknet::interface]
trait IAttestationQueueLibExternal<TContractState> {
    fn attestation_queue_create(
        ref self: TContractState, params: attestation_queue::AttestationQueueCreateParams
    ) -> attestation_queue::AttestationQueue;
    fn attestation_queue_update(
        ref self: TContractState, params: attestation_queue::AttestationQueueUpdateParams
    ) -> attestation_queue::AttestationQueue;
    fn attestation_queue_add_mr_enclave(
        ref self: TContractState, params: attestation_queue::AttestationQueueAddMrEnclaveParams
    ) -> attestation_queue::AttestationQueue;
    fn attestation_queue_remove_mr_enclave(
        ref self: TContractState, params: attestation_queue::AttestationQueueRemoveMrEnclaveParams
    ) -> attestation_queue::AttestationQueue;
    fn attestation_queue_set_permission(
        ref self: TContractState, params: attestation_queue::AttestationQueueSetPermissionParams
    ) -> u64;
    fn attestation_queue_get(
        self: @TContractState, attestation_queue_id: felt252
    ) -> attestation_queue::AttestationQueue;
}

#[starknet::component]
mod attestation_queue_lib {
    use alexandria_data_structures::array_ext::SpanTraitExt;
    use core::SpanTrait;
    use sb_permissions::IPermissionsLib;
    use sb_permissions::permissions_lib;
    use sb_util::component::IUtilLib;
    use sb_util::component::util_lib;
    use sb_util::guards;
    use sb_util::span::SpanImplTrait;
    use sb_util::span::StoreSpan;
    use super::IAttestationQueueLib;
    use super::attestation_queue::AttestationQueue;
    use super::attestation_queue::AttestationQueueAddMrEnclaveParams;
    use super::attestation_queue::AttestationQueueCreateParams;
    use super::attestation_queue::AttestationQueueRemoveMrEnclaveParams;
    use super::attestation_queue::AttestationQueueSetPermissionParams;
    use super::attestation_queue::AttestationQueueUpdateParams;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        AttestationQueueCreate: AttestationQueueCreate,
        AttestationQueueUpdate: AttestationQueueUpdate,
        AttestationQueueAddMrEnclave: AttestationQueueAddMrEnclave,
        AttestationQueueRemoveMrEnclave: AttestationQueueRemoveMrEnclave,
    }

    #[derive(Drop, starknet::Event)]
    struct AttestationQueueCreate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct AttestationQueueUpdate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct AttestationQueueAddMrEnclave {
        #[key]
        id: felt252,
        mr_enclave: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct AttestationQueueRemoveMrEnclave {
        #[key]
        id: felt252,
        mr_enclave: u256,
    }

    #[storage]
    struct Storage {
        // A list where the key is the index, and the value is the id of the routine.
        attestation_queue_ids: LegacyMap<felt252, felt252>,
        attestation_queue_ids_len: felt252,
        attestation_queue_map: LegacyMap<felt252, AttestationQueue>,
    }

    // For now we need to provie a helper to access UtilLib. In the future, helpers will be generated
    // to help components access their dependencies.
    #[generate_trait]
    impl Dependencies<
        TContractState,
        +HasComponent<TContractState>,
        +util_lib::HasComponent<TContractState>,
        +permissions_lib::HasComponent<TContractState>,
        +Drop<TContractState>
    > of DependenciesTrait<TContractState> {
        fn generate_id(ref self: ComponentState<TContractState>) -> felt252 {
            let mut contract = self.get_contract_mut();
            let mut util = util_lib::HasComponent::get_component_mut(ref contract);
            util.generate_id()
        }

        fn permissions_lib(
            ref self: ComponentState<TContractState>
        ) -> permissions_lib::ComponentState<TContractState> {
            let mut contract = self.get_contract_mut();
            permissions_lib::HasComponent::get_component_mut(ref contract)
        }
    }

    impl AttestationQueueLib<
        TContractState, +HasComponent<TContractState>
    > of super::IAttestationQueueLib<ComponentState<TContractState>> {
        fn set_last_heartbeat(
            ref self: ComponentState<TContractState>, attestation_queue_id: felt252
        ) {
            let mut account = self.assert(attestation_queue_id);
            account.updated_at = starknet::info::get_block_timestamp();
            self.attestation_queue_map.write(attestation_queue_id, account);
        }

        fn increment_gc(ref self: ComponentState<TContractState>, attestation_queue_id: felt252) {
            let mut account = self.assert(attestation_queue_id);
            account.gc_idx += 1;
            if account.gc_idx >= account.verifiers.len() {
                account.gc_idx = 0;
            }
            self.attestation_queue_map.write(attestation_queue_id, account);
        }

        fn increment_cur_idx(
            ref self: ComponentState<TContractState>, attestation_queue_id: felt252
        ) {
            let mut account = self.assert(attestation_queue_id);
            account.cur_idx += 1;
            if account.cur_idx >= account.verifiers.len() {
                account.cur_idx = 0;
            }
            self.attestation_queue_map.write(attestation_queue_id, account);
        }

        fn remove_verifier(
            ref self: ComponentState<TContractState>, attestation_queue_id: felt252, verifier_id: felt252
        ) {
            let mut account = self.assert(attestation_queue_id);
            account.verifiers = account.verifiers.filter(verifier_id);
            // Update the verifier list.
            if account.gc_idx >= account.verifiers.len() {
                account.gc_idx = 0;
            }
            if account.cur_idx >= account.verifiers.len() {
                account.cur_idx = 0;
            }
            self.attestation_queue_map.write(attestation_queue_id, account);
        }

        fn push(
            ref self: ComponentState<TContractState>,
            attestation_queue_id: felt252,
            verifier_id: felt252
        ) {
            let mut account = self.assert(attestation_queue_id);
            // Add the new Verifier ID value to the list of Verifiers on this queue.
            let mut new_verifiers = account.verifiers.snapshot.clone();
            new_verifiers.append(verifier_id);
            account.verifiers = new_verifiers.span();
            // Write the updated account to storage.
            self.attestation_queue_map.write(attestation_queue_id, account);
        }

        fn assert(
            self: @ComponentState<TContractState>, attestation_queue_id: felt252
        ) -> AttestationQueue {
            assert(self.exists(attestation_queue_id), 'AttestationQueueNotFound');
            self.get(attestation_queue_id)
        }

        fn get(
            self: @ComponentState<TContractState>, attestation_queue_id: felt252
        ) -> AttestationQueue {
            self.attestation_queue_map.read(attestation_queue_id)
        }

        fn exists(self: @ComponentState<TContractState>, attestation_queue_id: felt252) -> bool {
            self.get(attestation_queue_id).id != 0
        }
    }

    #[embeddable_as(AttestationQueueExternalImpl)]
    impl External<
        TContractState,
        +HasComponent<TContractState>,
        +util_lib::HasComponent<TContractState>,
        +permissions_lib::HasComponent<TContractState>,
        +Drop<TContractState>
    > of super::IAttestationQueueLibExternal<ComponentState<TContractState>> {
        fn attestation_queue_create(
            ref self: ComponentState<TContractState>, params: AttestationQueueCreateParams
        ) -> AttestationQueue {
            let id = self.generate_id();
            assert(!self.exists(id), 'AttQueueAlreadyExists');

            let now_timestamp = starknet::info::get_block_timestamp();
            let account = AttestationQueue {
                id: id,
                authority: params.authority,
                created_at: now_timestamp,
                updated_at: now_timestamp,
                allow_authority_overide_after: params.allow_authority_overide_after,
                require_heartbeat_permission: params.require_heartbeat_permission,
                require_usage_permission: params.require_usage_permission,
                max_size: params.max_size,
                max_verifier_verification_age: params.max_verifier_verification_age,
                max_consecutive_function_failures: params.max_consecutive_function_failures,
                reward: params.reward,
                last_heartbeat: 0,
                verifier_timeout: params.verifier_timeout,
                mr_enclaves: array![].span(),
                verifiers: array![].span(),
                cur_idx: 0,
                gc_idx: 0,
            };
            // Write the new account to the account store.
            self.attestation_queue_map.write(id, account);
            // Add the new ID to the list of known AttestationQueue and increment the len.
            self.attestation_queue_ids.write(self.attestation_queue_ids_len.read(), id);
            self.attestation_queue_ids_len.write(self.attestation_queue_ids_len.read() + 1);
            // Emit an AttestationQueueCreate event.
            let event = AttestationQueueCreate { id, authority: params.authority };
            self.emit(Event::AttestationQueueCreate(event));
            account
        }

        fn attestation_queue_update(
            ref self: ComponentState<TContractState>, params: AttestationQueueUpdateParams
        ) -> AttestationQueue {
            let id = params.id;
            let mut account = self.assert(id);
            guards::check_authority(account.authority);

            account.authority = params.authority;
            account.allow_authority_overide_after = params.allow_authority_overide_after;
            account.require_heartbeat_permission = params.require_heartbeat_permission;
            account.require_usage_permission = params.require_usage_permission;
            account.max_size = params.max_size;
            account.max_verifier_verification_age = params.max_verifier_verification_age;
            account.max_consecutive_function_failures = params.max_consecutive_function_failures;
            account.reward = params.reward;
            account.verifier_timeout = params.verifier_timeout;
            account.updated_at = starknet::info::get_block_timestamp();
            // Write the new account to the account store.
            self.attestation_queue_map.write(id, account);
            // Emit an AttestationQueueUpdate event.
            let event = AttestationQueueUpdate { id, authority: params.authority };
            self.emit(Event::AttestationQueueUpdate(event));
            account
        }


        fn attestation_queue_add_mr_enclave(
            ref self: ComponentState<TContractState>, params: AttestationQueueAddMrEnclaveParams
        ) -> AttestationQueue {
            let id = params.id;
            let mut account = self.assert(id);
            guards::check_authority(account.authority);

            // Make sure that the provided MrEnclave is not already listed in the account.
            assert(
                account.mr_enclaves.index_of(params.mr_enclave).is_none(),
                'MrEnclaveAlreadyExistsError'
            );
            assert(account.mr_enclaves.len() < 16, 'TooManyMrEnclavesError');

            // Add the new MrEnclave value to the list of measurements.
            let mut new_mr_enclaves = account.mr_enclaves.snapshot.clone();
            new_mr_enclaves.append(params.mr_enclave);
            account.mr_enclaves = new_mr_enclaves.span();
            account.updated_at = starknet::info::get_block_timestamp();

            // Write the new account to the account store.
            self.attestation_queue_map.write(id, account);
            // Emit an AttestationQueueUpdate event.
            let event = AttestationQueueAddMrEnclave { id, mr_enclave: params.mr_enclave };
            self.emit(Event::AttestationQueueAddMrEnclave(event));
            account
        }

        fn attestation_queue_remove_mr_enclave(
            ref self: ComponentState<TContractState>, params: AttestationQueueRemoveMrEnclaveParams
        ) -> AttestationQueue {
            let id = params.id;
            let mut account = self.assert(id);
            guards::check_authority(account.authority);
            // Make sure that the provided MrEnclave value is found in the listed measurements.
            assert(account.mr_enclaves.contains(params.mr_enclave), 'MrEnclaveNotFound');

            account.mr_enclaves = account.mr_enclaves.filter(params.mr_enclave);
            account.updated_at = starknet::info::get_block_timestamp();

            // Write the new account to the account store.
            self.attestation_queue_map.write(id, account);
            // Emit an AttestationQueueUpdate event.
            let event = AttestationQueueRemoveMrEnclave { id, mr_enclave: params.mr_enclave };
            self.emit(Event::AttestationQueueRemoveMrEnclave(event));
            account
        }


        fn attestation_queue_set_permission(
            ref self: ComponentState<TContractState>, params: AttestationQueueSetPermissionParams
        ) -> u64 {
            let id = params.id;
            let mut account = self.assert(id);
            guards::check_authority(account.authority);

            let mut permissions_lib = self.permissions_lib();
            permissions_lib.set(id, params.grantee, params.permission, params.on)
        }

        fn attestation_queue_get(
            self: @ComponentState<TContractState>, attestation_queue_id: felt252
        ) -> AttestationQueue {
            self.assert(attestation_queue_id)
        }
    }
}
