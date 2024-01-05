mod routine;

#[cfg(test)]
mod tests;

#[starknet::interface]
trait IRoutineLib<State> {
    fn assert(self: @State, routine_id: felt252) -> routine::Routine;
    fn get(self: @State, routine_id: felt252) -> routine::Routine;
    fn exists(self: @State, routine_id: felt252) -> bool;
    fn fund(ref self: State, routine_id: felt252, amount: u256);
    fn withdraw(ref self: State, routine_id: felt252, amount: u256);
}

#[starknet::interface]
trait IRoutineLibExternal<State> {
    fn routine_create(ref self: State, params: routine::RoutineCreateParams) -> routine::Routine;
    fn routine_update(ref self: State, params: routine::RoutineUpdateParams) -> routine::Routine;
    fn routine_get(self: @State, routine_id: felt252) -> routine::Routine;
}

#[starknet::component]
mod routine_lib {
    use sb_function::function::FunctionStatus;
    use sb_function::{function_lib, IFunctionLib, IFunctionLibExternal};
    use sb_util::component::{util_lib, IUtilLib};
    use sb_util::guards;
    use super::IRoutineLib;
    use super::routine::Routine;
    use super::routine::RoutineCreateParams;
    use super::routine::RoutineUpdateParams;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        RoutineCreate: RoutineCreate,
        RoutineUpdate: RoutineUpdate,
    }

    #[derive(Drop, starknet::Event)]
    struct RoutineCreate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct RoutineUpdate {
        #[key]
        id: felt252,
        authority: starknet::ContractAddress,
    }

    #[storage]
    struct Storage {
        // A list where the key is the index, and the value is the id of the routine.
        routine_ids: LegacyMap<felt252, felt252>,
        routine_ids_len: felt252,
        routine_map: LegacyMap<felt252, Routine>,
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

    impl RoutineLib<
        TContractState, +HasComponent<TContractState>
    > of super::IRoutineLib<ComponentState<TContractState>> {
        fn assert(self: @ComponentState<TContractState>, routine_id: felt252) -> Routine {
            assert(self.exists(routine_id), 'RoutineNotFound');
            self.get(routine_id)
        }

        fn get(self: @ComponentState<TContractState>, routine_id: felt252) -> Routine {
            self.routine_map.read(routine_id)
        }

        fn exists(self: @ComponentState<TContractState>, routine_id: felt252) -> bool {
            self.get(routine_id).id != 0
        }

        fn fund(ref self: ComponentState<TContractState>, routine_id: felt252, amount: u256) {
            let mut routine = self.get(routine_id);
            routine.balance += amount;
            if routine.balance == 0 {
                // TODO: This should check if routine.balance < queue.reward
                routine.status = sb_function::function::FunctionStatus::OutOfFunds;
            } else {
                routine.status = sb_function::function::FunctionStatus::None;
            }
            // TODO: make payment transfer
            self.routine_map.write(routine_id, routine);
        }

        fn withdraw(ref self: ComponentState<TContractState>, routine_id: felt252, amount: u256) {
            let mut routine = self.get(routine_id);
            sb_util::guards::check_balance(routine.balance, amount);
            routine.balance -= amount;
            if routine.balance == 0 {
                // TODO: This should check if routine.balance < queue.reward
                routine.status = sb_function::function::FunctionStatus::OutOfFunds;
            }
            // TODO: make payment transfer
            self.routine_map.write(routine_id, routine);
        }
    }

    #[embeddable_as(RoutineExternalImpl)]
    impl External<
        TContractState,
        +HasComponent<TContractState>,
        +util_lib::HasComponent<TContractState>,
        +function_lib::HasComponent<TContractState>,
        +Drop<TContractState>
    > of super::IRoutineLibExternal<ComponentState<TContractState>> {
        fn routine_create(
            ref self: ComponentState<TContractState>, params: RoutineCreateParams
        ) -> Routine {
            let id = self.generate_id();
            assert(!self.exists(id), 'RoutineAlreadyExists');
            self.function_assert(params.function_id);

            let now_timestamp = starknet::info::get_block_timestamp();
            let account = Routine {
                id: id,
                authority: params.authority,
                created_at: now_timestamp,
                updated_at: now_timestamp,
                last_executed_at: 0,
                schedule: params.schedule,
                function_id: params.function_id,
                params: params.params,
                consecutive_failures: 0,
                balance: 0,
                status: FunctionStatus::None,
                errorCode: 0,
            };
            // Write the new account to the account store.
            self.routine_map.write(id, account);
            // Add the new ID to the list of known Routine and increment the len.
            self.routine_ids.write(self.routine_ids_len.read(), id);
            self.routine_ids_len.write(self.routine_ids_len.read() + 1);
            // Emit an RoutineCreate event.
            let event = RoutineCreate { id, authority: params.authority };
            self.emit(Event::RoutineCreate(event));
            account
        }

        fn routine_update(
            ref self: ComponentState<TContractState>, params: RoutineUpdateParams
        ) -> Routine {
            let id = params.id;
            let mut account = self.assert(id);
            guards::check_authority(account.authority);
            self.function_assert(params.function_id);

            account.authority = params.authority;
            account.schedule = params.schedule;
            account.function_id = params.function_id;
            account.params = params.params;
            account.updated_at = starknet::info::get_block_timestamp();
            // Write the new account to the account store.
            self.routine_map.write(id, account);
            // Emit an RoutineUpdate event.
            let event = RoutineUpdate { id, authority: params.authority };
            self.emit(Event::RoutineUpdate(event));
            account
        }

        fn routine_get(self: @ComponentState<TContractState>, routine_id: felt252) -> Routine {
            self.assert(routine_id)
        }
    }
}
