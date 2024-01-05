mod request;

#[cfg(test)]
mod tests;

#[starknet::interface]
trait IRequestLib<State> {
    fn assert(self: @State, request_id: felt252) -> request::Request;
    fn get(self: @State, request_id: felt252) -> request::Request;
    fn exists(self: @State, request_id: felt252) -> bool;
}

#[starknet::interface]
trait IRequestLibExternal<State> {
    fn request_create(ref self: State, params: request::RequestCreateParams) -> request::Request;
    fn request_update(ref self: State, params: request::RequestUpdateParams) -> request::Request;
    fn request_get(self: @State, request_id: felt252) -> request::Request;
}

#[starknet::component]
mod request_lib {
    use sb_function::function::FunctionStatus;
    use sb_function::{function_lib, IFunctionLib, IFunctionLibExternal};
    use sb_util::component::{util_lib, IUtilLib};
    use sb_util::guards;
    use super::IRequestLib;
    use super::request::Request;
    use super::request::RequestCreateParams;
    use super::request::RequestUpdateParams;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        RequestCreate: RequestCreate,
        RequestUpdate: RequestUpdate,
    }

    #[derive(Drop, starknet::Event)]
    struct RequestCreate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct RequestUpdate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
    }

    #[storage]
    struct Storage {
        // A list where the key is the index, and the value is the id of the Request.
        request_ids: LegacyMap<felt252, felt252>,
        request_ids_len: felt252,
        request_map: LegacyMap<felt252, Request>,
    }

    // For now we need to provie a helper to access UtilLib. In the future, helpers will be generated
    // to help components access their dependencies.
    #[generate_trait]
    impl Dependencies<
        TContractState,
        +HasComponent<TContractState>,
        +util_lib::HasComponent<TContractState>,
        +function_lib::HasComponent<TContractState>,
        +Drop<TContractState>
    > of DependenciesTrait<TContractState> {
        fn generate_id(ref self: ComponentState<TContractState>) -> felt252 {
            let mut contract = self.get_contract_mut();
            let mut util = util_lib::HasComponent::get_component_mut(ref contract);
            util.generate_id()
        }

        fn function_assert(ref self: ComponentState<TContractState>, id: felt252) {
            let mut contract = self.get_contract_mut();
            let mut function_lib = function_lib::HasComponent::get_component_mut(ref contract);
            function_lib.assert(id);
        }
    }

    impl RequestLib<
        TContractState, +HasComponent<TContractState>
    > of super::IRequestLib<ComponentState<TContractState>> {
        fn assert(self: @ComponentState<TContractState>, request_id: felt252) -> Request {
            assert(self.exists(request_id), 'RequestNotFound');
            self.get(request_id)
        }

        fn get(self: @ComponentState<TContractState>, request_id: felt252) -> Request {
            self.request_map.read(request_id)
        }

        fn exists(self: @ComponentState<TContractState>, request_id: felt252) -> bool {
            self.get(request_id).id != 0
        }
    }

    #[embeddable_as(RequestExternalImpl)]
    impl External<
        TContractState,
        +HasComponent<TContractState>,
        +util_lib::HasComponent<TContractState>,
        +function_lib::HasComponent<TContractState>,
        +Drop<TContractState>
    > of super::IRequestLibExternal<ComponentState<TContractState>> {
        fn request_create(
            ref self: ComponentState<TContractState>, params: RequestCreateParams
        ) -> Request {
            let id = self.generate_id();
            assert(!self.exists(id), 'RequestAlreadyExists');
            self.function_assert(params.function_id);

            let now_timestamp = starknet::info::get_block_timestamp();
            let account = Request {
                id: id,
                authority: params.authority,
                created_at: now_timestamp,
                updated_at: now_timestamp,
                last_executed_at: 0,
                function_id: params.function_id,
                params: params.params,
                consecutive_failures: 0,
                balance: 0,
                executed: false,
                start_after: params.start_after,
                status: FunctionStatus::None,
                errorCode: 0,
            };
            // Write the new account to the account store.
            self.request_map.write(id, account);
            // Add the new ID to the list of known Request and increment the len.
            self.request_ids.write(self.request_ids_len.read(), id);
            self.request_ids_len.write(self.request_ids_len.read() + 1);
            // Emit an RequestCreate event.
            let event = RequestCreate { id, authority: params.authority };
            self.emit(Event::RequestCreate(event));
            account
        }

        fn request_update(
            ref self: ComponentState<TContractState>, params: RequestUpdateParams
        ) -> Request {
            let id = params.id;
            let mut account = self.assert(id);
            guards::check_authority(account.authority);
            self.function_assert(params.function_id);

            account.authority = params.authority;
            account.function_id = params.function_id;
            account.params = params.params;
            account.start_after = params.start_after;
            account.updated_at = starknet::info::get_block_timestamp();
            // Write the new account to the account store.
            self.request_map.write(id, account);
            // Emit an RequestUpdate event.
            let event = RequestUpdate { id, authority: params.authority };
            self.emit(Event::RequestUpdate(event));
            account
        }

        fn request_get(self: @ComponentState<TContractState>, request_id: felt252) -> Request {
            self.assert(request_id)
        }
    }
}
