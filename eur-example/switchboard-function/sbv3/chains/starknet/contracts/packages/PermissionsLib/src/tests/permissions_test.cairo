use sb_permissions::permissions::{Permission};

#[starknet::contract]
mod TestContract {
    use sb_permissions::{permissions::Permission, permissions_lib};

    component!(path: permissions_lib, storage: permissions, event: PermissionsEvent);

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        PermissionsEvent: permissions_lib::Event
    }

    #[storage]
    struct Storage {
        #[substorage(v0)]
        permissions: permissions_lib::Storage
    }

    impl Permissions = permissions_lib::PermissionsLibImpl<ContractState>;

    fn get(self: @ContractState, granter: felt252, grantee: felt252) -> u64 {
        self.permissions.permissions_map.read((0, 0))
    }

    fn has(self: @ContractState, granter: felt252, grantee: felt252, perm: Permission) -> bool {
        Permissions::has(self, granter, grantee, perm)
    }

    fn set(
        ref self: ContractState, granter: felt252, grantee: felt252, perm: Permission, on: bool
    ) {
        let resp = Permissions::set(ref self, granter, grantee, perm, on);
    }
}

#[test]
#[available_gas(2000000)]
fn no_permissions_test() {
    let mut state = TestContract::contract_state_for_testing();
    let permissions = TestContract::get(@state, 0, 0);
    assert(permissions == 0, 'BadStartingPermissions');
    // Permissions == 0 should have no permissions set.
    assert(!TestContract::has(@state, 0, 0, Permission::Heartbeat), 'HasHeartbeat');
    assert(!TestContract::has(@state, 0, 0, Permission::Usage), 'HasUsage');
    assert(!TestContract::has(@state, 0, 0, Permission::CanServiceQueue), 'HasCanServiceQueue');
}

#[test]
#[available_gas(2000000)]
fn update_Heartbeat_permissions() {
    // Start with no permissions.
    let mut state = TestContract::contract_state_for_testing();
    let permissions = TestContract::get(@state, 0, 0);
    assert(permissions == 0, 'BadStartingPermissions');
    // Turn Heartbeat permission on.
    TestContract::set(ref state, 0, 0, Permission::Heartbeat, true);
    assert(TestContract::has(@state, 0, 0, Permission::Heartbeat), '1-HasHeartbeat');
    assert(!TestContract::has(@state, 0, 0, Permission::Usage), '1-HasUsage');
    assert(!TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '1-HasCanServiceQueue');
    // Toggling it on again doesn't change the state.
    TestContract::set(ref state, 0, 0, Permission::Heartbeat, true);
    assert(TestContract::has(@state, 0, 0, Permission::Heartbeat), '2-HasHeartbeat');
    assert(!TestContract::has(@state, 0, 0, Permission::Usage), '2-HasUsage');
    assert(!TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '2-HasCanServiceQueue');
    // Turn Heartbeat permission off.
    TestContract::set(ref state, 0, 0, Permission::Heartbeat, false);
    assert(!TestContract::has(@state, 0, 0, Permission::Heartbeat), '3-HasHeartbeat');
    assert(!TestContract::has(@state, 0, 0, Permission::Usage), '3-HasUsage');
    assert(!TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '3-HasCanServiceQueue');
}

#[test]
#[available_gas(2000000)]
fn update_Usage_permissions() {
    // Start with no permissions.
    let mut state = TestContract::contract_state_for_testing();
    let permissions = TestContract::get(@state, 0, 0);
    assert(permissions == 0, 'BadStartingPermissions');
    // Turn Usage permission on.
    TestContract::set(ref state, 0, 0, Permission::Usage, true);
    assert(!TestContract::has(@state, 0, 0, Permission::Heartbeat), '1-HasHeartbeat');
    assert(TestContract::has(@state, 0, 0, Permission::Usage), '1-HasUsage');
    assert(!TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '1-HasCanServiceQueue');
    // Toggling it on again doesn't change the state.
    TestContract::set(ref state, 0, 0, Permission::Usage, true);
    assert(!TestContract::has(@state, 0, 0, Permission::Heartbeat), '2-HasHeartbeat');
    assert(TestContract::has(@state, 0, 0, Permission::Usage), '2-HasUsage');
    assert(!TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '2-HasCanServiceQueue');
    // Turn Usage permission off.
    TestContract::set(ref state, 0, 0, Permission::Usage, false);
    assert(!TestContract::has(@state, 0, 0, Permission::Heartbeat), '3-HasHeartbeat');
    assert(!TestContract::has(@state, 0, 0, Permission::Usage), '3-HasUsage');
    assert(!TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '3-HasCanServiceQueue');
}

#[test]
#[available_gas(2000000)]
fn update_CanServiceQueue_permissions() {
    // Start with no permissions.
    let mut state = TestContract::contract_state_for_testing();
    let permissions = TestContract::get(@state, 0, 0);
    assert(permissions == 0, 'BadStartingPermissions');
    // Turn CanServiceQueue permission on.
    TestContract::set(ref state, 0, 0, Permission::CanServiceQueue, true);
    assert(!TestContract::has(@state, 0, 0, Permission::Heartbeat), '1-HasHeartbeat');
    assert(!TestContract::has(@state, 0, 0, Permission::Usage), '1-HasUsage');
    assert(TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '1-HasCanServiceQueue');
    // Toggling it on again doesn't change the state.
    TestContract::set(ref state, 0, 0, Permission::CanServiceQueue, true);
    assert(!TestContract::has(@state, 0, 0, Permission::Heartbeat), '2-HasHeartbeat');
    assert(!TestContract::has(@state, 0, 0, Permission::Usage), '2-HasUsage');
    assert(TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '2-HasCanServiceQueue');
    // Turn CanServiceQueue permission off.
    TestContract::set(ref state, 0, 0, Permission::CanServiceQueue, false);
    assert(!TestContract::has(@state, 0, 0, Permission::Heartbeat), '3-HasHeartbeat');
    assert(!TestContract::has(@state, 0, 0, Permission::Usage), '3-HasUsage');
    assert(!TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '3-HasCanServiceQueue');
}

#[test]
#[available_gas(2000000)]
fn update_permissions_compound() {
    // Start with no permissions.
    let mut state = TestContract::contract_state_for_testing();
    let permissions = TestContract::get(@state, 0, 0);
    assert(permissions == 0, 'BadStartingPermissions');
    // Turn Heartbeat and Usage permissions on.
    TestContract::set(ref state, 0, 0, Permission::Heartbeat, true);
    TestContract::set(ref state, 0, 0, Permission::Usage, true);
    assert(TestContract::has(@state, 0, 0, Permission::Heartbeat), '1-HasHeartbeat');
    assert(TestContract::has(@state, 0, 0, Permission::Usage), '1-HasUsage');
    assert(!TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '1-HasCanServiceQueue');
    // Turn Usage off and CanServiceQueue on.
    TestContract::set(ref state, 0, 0, Permission::Usage, false);
    TestContract::set(ref state, 0, 0, Permission::CanServiceQueue, true);
    assert(TestContract::has(@state, 0, 0, Permission::Heartbeat), '2-HasHeartbeat');
    assert(!TestContract::has(@state, 0, 0, Permission::Usage), '2-HasUsage');
    assert(TestContract::has(@state, 0, 0, Permission::CanServiceQueue), '2-HasCanServiceQueue');
}

