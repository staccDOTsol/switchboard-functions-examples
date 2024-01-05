//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library AdminLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.admin.storage");

    struct DiamondStorage {
        bool initialized;
        mapping(address => bool) admins;
        mapping(address => bool) allowedUsers;
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

    function setInitialized() internal {
        diamondStorage().initialized = true;
    }

    function isInitialized() internal view returns (bool) {
        return diamondStorage().initialized;
    }

    function setAdmin(address sender, bool status) internal {
        diamondStorage().admins[sender] = status;
    }

    function setAllowed(address sender, bool status) internal {
        diamondStorage().allowedUsers[sender] = status;
    }

    function isAdmin(address sender) internal view returns (bool) {
        return diamondStorage().admins[sender];
    }

    function isAllowed(address sender) internal view returns (bool) {
        return
            diamondStorage().allowedUsers[sender] ||
            diamondStorage().admins[sender];
    }
}
