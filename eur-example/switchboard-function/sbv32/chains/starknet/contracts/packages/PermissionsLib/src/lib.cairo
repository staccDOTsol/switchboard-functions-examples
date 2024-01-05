mod permissions;

#[cfg(test)]
mod tests;

#[starknet::interface]
trait IPermissionsLib<State> {
    fn has(
        self: @State, granter: felt252, grantee: felt252, permission: permissions::Permission
    ) -> bool;
    fn set(
        ref self: State,
        granter: felt252,
        grantee: felt252,
        permission: permissions::Permission,
        on: bool
    ) -> u64;
}

#[starknet::component]
mod permissions_lib {
    use sb_util::math::U64IntegerExt;
    use super::permissions::Permission;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        PermissionUpdated: PermissionUpdated
    }

    #[derive(Drop, starknet::Event)]
    struct PermissionUpdated {
        #[key]
        granter: felt252,
        #[key]
        grantee: felt252,
        #[key]
        permission: Permission,
        on: bool,
    }

    #[storage]
    struct Storage {
        permissions_map: LegacyMap<(felt252, felt252), u64>,
    }

    fn _getPermissionCode(permission: Permission) -> u64 {
        match permission {
            Permission::Heartbeat => 2.exp(0),
            Permission::Usage => 2.exp(1),
            Permission::CanServiceQueue => 2.exp(2),
        }
    }

    #[embeddable_as(PermissionsLibImpl)]
    impl PermissionsLib<
        TContractState, +HasComponent<TContractState>
    > of super::IPermissionsLib<ComponentState<TContractState>> {
        // Returns true if the `granter` has granted the `grantee` a specific `permission`.
        fn has(
            self: @ComponentState<TContractState>,
            granter: felt252,
            grantee: felt252,
            permission: Permission
        ) -> bool {
            let cur_permissions = self.permissions_map.read((granter, grantee));
            (cur_permissions & _getPermissionCode(permission)) != 0
        }

        // Returns true if the `granter` has granted the `grantee` a specific `permission`
        fn set(
            ref self: ComponentState<TContractState>,
            granter: felt252,
            grantee: felt252,
            permission: Permission,
            on: bool
        ) -> u64 {
            let cur_permissions = self.permissions_map.read((granter, grantee));
            if (on) {
                // To turn a permission bit on, use a bitwise OR is used (001 | 100 = 101)
                let cur_permissions = cur_permissions | _getPermissionCode(permission);
                self.permissions_map.write((granter, grantee), cur_permissions);
                cur_permissions
            } else {
                // To turn a permission bit off, use a bitwise AND with the NOT value of the permission code.
                let cur_permissions = cur_permissions & ~_getPermissionCode(permission);
                self.permissions_map.write((granter, grantee), cur_permissions);
                cur_permissions
            }
        }
    }
}
