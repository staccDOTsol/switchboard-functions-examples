mod function;

#[cfg(test)]
mod tests;

#[starknet::interface]
trait IFunctionLib<State> {
    fn assert(self: @State, function_id: felt252) -> function::Function;
    fn get(self: @State, function_id: felt252) -> function::Function;
    fn exists(self: @State, function_id: felt252) -> bool;
}

#[starknet::interface]
trait IFunctionLibExternal<State> {
    fn function_create(
        ref self: State, params: function::FunctionCreateParams
    ) -> function::Function;
    fn function_update(
        ref self: State, params: function::FunctionUpdateParams
    ) -> function::Function;
    fn function_verify(ref self: State, function_id: felt252);
    fn function_get(self: @State, function_id: felt252) -> function::Function;
}

#[starknet::component]
mod function_lib {
    use sb_attestation_queue::IAttestationQueueLib;
    use sb_attestation_queue::{attestation_queue_lib, IAttestationQueueLibExternal};
    use sb_permissions::{permissions_lib};
    use sb_util::component::{util_lib, IUtilLib};
    use sb_util::guards;
    use sb_verifier::{verifier_lib, IVerifierLib, IVerifierLibExternal};
    use super::IFunctionLib;
    use super::function::Function;
    use super::function::FunctionConfig;
    use super::function::FunctionCreateParams;
    use super::function::FunctionState;
    use super::function::FunctionStatus;
    use super::function::FunctionUpdateParams;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        FunctionCreate: FunctionCreate,
        FunctionUpdate: FunctionUpdate,
    }

    #[derive(Drop, starknet::Event)]
    struct FunctionCreate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct FunctionUpdate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
    }

    #[storage]
    struct Storage {
        // A list where the key is the index, and the value is the id of the Function.
        function_ids: LegacyMap<felt252, felt252>,
        function_ids_len: felt252,
        function_map: LegacyMap<felt252, Function>,
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
        +verifier_lib::HasComponent<TContractState>,
        +Drop<TContractState>
    > of DependenciesTrait<TContractState> {
        fn generate_id(ref self: ComponentState<TContractState>) -> felt252 {
            let mut contract = self.get_contract_mut();
            let mut util = util_lib::HasComponent::get_component_mut(ref contract);
            util.generate_id()
        }

        fn attestation_queue_assert(ref self: ComponentState<TContractState>, id: felt252) {
            let mut contract = self.get_contract_mut();
            let mut attestation_queue_lib = attestation_queue_lib::HasComponent::get_component_mut(
                ref contract
            );
            attestation_queue_lib.assert(id);
        }

        fn verifier_create(
            ref self: ComponentState<TContractState>, params: verifier_lib::VerifierCreateParams
        ) -> felt252 {
            let mut contract = self.get_contract_mut();
            let mut lib = verifier_lib::HasComponent::get_component_mut(ref contract);
            lib.verifier_create(params).id
        }
    }

    impl FunctionLib<
        TContractState, +HasComponent<TContractState>
    > of super::IFunctionLib<ComponentState<TContractState>> {
        fn assert(self: @ComponentState<TContractState>, function_id: felt252) -> Function {
            assert(self.exists(function_id), 'FunctionNotFound');
            self.get(function_id)
        }

        fn get(self: @ComponentState<TContractState>, function_id: felt252) -> Function {
            self.function_map.read(function_id)
        }

        fn exists(self: @ComponentState<TContractState>, function_id: felt252) -> bool {
            self.get(function_id).id != 0
        }
    }

    #[embeddable_as(FunctionExternalImpl)]
    impl External<
        TContractState,
        +HasComponent<TContractState>,
        +attestation_queue_lib::HasComponent<TContractState>,
        +permissions_lib::HasComponent<TContractState>,
        +util_lib::HasComponent<TContractState>,
        +verifier_lib::HasComponent<TContractState>,
        +Drop<TContractState>
    > of super::IFunctionLibExternal<ComponentState<TContractState>> {
        fn function_create(
            ref self: ComponentState<TContractState>, params: FunctionCreateParams
        ) -> Function {
            let id = self.generate_id();
            assert(!self.exists(id), 'FunctionAlreadyExists');
            self.attestation_queue_assert(params.attestation_queue_id);

            let verifier_id = self
                .verifier_create(
                    verifier_lib::VerifierCreateParams {
                        authority: params.authority,
                        signer: starknet::contract_address::ContractAddressZeroable::zero(),
                        attestation_queue_id: params.attestation_queue_id,
                    }
                );
            let now_timestamp = starknet::info::get_block_timestamp();
            let account = Function {
                id: id,
                name: params.name,
                authority: params.authority,
                verifier_id: verifier_id,
                attestation_queue_id: params.attestation_queue_id,
                created_at: now_timestamp,
                updated_at: now_timestamp,
                status: FunctionStatus::None,
                config: FunctionConfig {
                    container_registry: params.container_registry,
                    container: params.container,
                    version: params.version,
                    mr_enclaves: params.mr_enclaves,
                },
                state: FunctionState {
                    last_execution_timestamp: 0,
                    last_execution_gas_cost: 0,
                    consecutive_failures: 0,
                    triggered_since: 0,
                    triggered_count: 0,
                    triggered: false,
                    queue_idx: 0,
                }
            };
            // Write the new account to the account store.
            self.function_map.write(id, account);
            // Add the new ID to the list of known Function and increment the len.
            self.function_ids.write(self.function_ids_len.read(), id);
            self.function_ids_len.write(self.function_ids_len.read() + 1);
            // Emit an FunctionCreate event.
            let event = FunctionCreate { id, authority: params.authority };
            self.emit(Event::FunctionCreate(event));
            account
        }

        fn function_update(
            ref self: ComponentState<TContractState>, params: FunctionUpdateParams
        ) -> Function {
            let id = params.id;
            let mut account = self.assert(id);
            guards::check_authority(account.authority);

            account.name = params.name;
            account.authority = params.authority;
            account.config.container_registry = params.container_registry;
            account.config.container = params.container;
            account.config.version = params.version;
            account.config.mr_enclaves = params.mr_enclaves;
            // Write the new account to the account store.
            self.function_map.write(id, account);
            // Emit an FunctionUpdate event.
            let event = FunctionUpdate { id, authority: params.authority };
            self.emit(Event::FunctionUpdate(event));
            account
        }

        fn function_verify(ref self: ComponentState<TContractState>, function_id: felt252) {}

        fn function_get(self: @ComponentState<TContractState>, function_id: felt252) -> Function {
            self.assert(function_id)
        }
    }
}
