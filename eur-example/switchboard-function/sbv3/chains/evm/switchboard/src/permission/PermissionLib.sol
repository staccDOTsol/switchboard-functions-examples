//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library PermissionLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.permission.storage");

    enum Permission {
        HEARTBEAT,
        USAGE,
        CAN_SERVICE_QUEUE
    }

    struct DiamondStorage {
        mapping(address => mapping(address => uint256)) permissions;
    }

    function diamondStorage()
        internal
        pure
        returns (DiamondStorage storage ds)
    {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    function getPermissionCode(Permission p) internal pure returns (uint256) {
        uint256 code = uint256(p);
        return (1 << code);
    }

    // Turn a permission on or off for a node or node authority
    function setPermission(
        address granter,
        address grantee,
        uint256 permission,
        bool on
    ) internal {
        DiamondStorage storage ds = diamondStorage();
        // set the permission
        if (on) {
            ds.permissions[granter][grantee] |= permission;
        } else {
            ds.permissions[granter][grantee] &= ~permission;
        }
    }

    function hasPermission(
        address granter,
        address grantee,
        uint256 permission
    ) internal view returns (bool) {
        DiamondStorage storage ds = diamondStorage();
        return ds.permissions[granter][grantee] & permission != 0;
    }
}
