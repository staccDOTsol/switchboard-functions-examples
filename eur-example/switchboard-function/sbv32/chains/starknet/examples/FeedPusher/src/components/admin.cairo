#[starknet::interface]
trait IAdminLib<State> {
    fn initialize(ref self: State);
    fn assert_admin(self: @State);
}

#[starknet::interface]
trait IExternalAdminLib<State> {
    fn set_switchboard(ref self: State, address: starknet::ContractAddress);
    fn set_class_hash(ref self: State, class_hash: starknet::ClassHash);
    fn set_function(ref self: State, function_id: felt252);
    fn set_is_admin(ref self: State, address: starknet::ContractAddress, status: bool);
    fn set_is_allowed(ref self: State, address: starknet::ContractAddress, status: bool);
    fn get_switchboard(self: @State) -> starknet::ContractAddress;
    fn get_function_id(self: @State) -> felt252;
    fn get_is_admin(self: @State, address: starknet::ContractAddress) -> bool;
    fn get_is_allowed(self: @State, address: starknet::ContractAddress) -> bool;
}

#[starknet::component]
mod admin_lib {
    use core::option::OptionTrait;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        InitializeContract: InitializeContract,
    }


    #[derive(Drop, starknet::Event)]
    struct InitializeContract {
        #[key]
        by: starknet::ContractAddress,
    }

    #[storage]
    struct Storage {
        initialized: bool,
        switchboard: starknet::ContractAddress,
        function_id: felt252,
        admins: LegacyMap<starknet::ContractAddress, bool>,
        allowed_users: LegacyMap<starknet::ContractAddress, bool>,
    }

    impl AdminLib<
        TContractState, +HasComponent<TContractState>
    > of super::IAdminLib<ComponentState<TContractState>> {
        fn initialize(ref self: ComponentState<TContractState>) {
            assert(!self.initialized.read(), 'ContractAlreadyInitialized');
            // If contract isn't already initialized, do so.
            self.initialized.write(true);
            let by = starknet::Felt252TryIntoContractAddress::try_into(
                0x6ce3557488C451FceD3Ecae82E6F24e164d147562138615Acf8501CBfd4E21
            )
                .unwrap();
            self.admins.write(by, true);
            self.emit(Event::InitializeContract(InitializeContract { by }));
        }
        fn assert_admin(self: @ComponentState<TContractState>) {
            assert(self.admins.read(starknet::get_caller_address()), 'ACLNotAdmin');
        }
    }

    #[embeddable_as(AdminImpl)]
    impl ExternalAdminLib<
        TContractState, +HasComponent<TContractState>
    > of super::IExternalAdminLib<ComponentState<TContractState>> {
        fn set_class_hash(
            ref self: ComponentState<TContractState>, class_hash: starknet::ClassHash
        ) {
            self.assert_admin();
            starknet::replace_class_syscall(class_hash).unwrap();
        }
        fn set_switchboard(
            ref self: ComponentState<TContractState>, address: starknet::ContractAddress
        ) {
            self.assert_admin();
            self.switchboard.write(address);
        }
        fn set_function(ref self: ComponentState<TContractState>, function_id: felt252) {
            self.assert_admin();
            self.function_id.write(function_id);
        }
        fn set_is_admin(
            ref self: ComponentState<TContractState>,
            address: starknet::ContractAddress,
            status: bool
        ) {
            self.assert_admin();
            self.admins.write(address, status);
        }
        fn set_is_allowed(
            ref self: ComponentState<TContractState>,
            address: starknet::ContractAddress,
            status: bool
        ) {
            self.assert_admin();
            self.allowed_users.write(address, status);
        }
        fn get_switchboard(self: @ComponentState<TContractState>) -> starknet::ContractAddress {
            self.switchboard.read()
        }
        fn get_function_id(self: @ComponentState<TContractState>) -> felt252 {
            self.function_id.read()
        }
        fn get_is_admin(
            self: @ComponentState<TContractState>, address: starknet::ContractAddress
        ) -> bool {
            self.admins.read(address)
        }
        fn get_is_allowed(
            self: @ComponentState<TContractState>, address: starknet::ContractAddress
        ) -> bool {
            self.allowed_users.read(address)
        }
    }
}
