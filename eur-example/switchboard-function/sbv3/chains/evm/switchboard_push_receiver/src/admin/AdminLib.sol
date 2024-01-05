//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library AdminLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.admin.storage");

    struct DiamondStorage {
        bool initialized;
        mapping(address => bool) admins;
        mapping(address => bool) allowedUsers;
        // Switchboard Contract
        address switchboard;
        // Oracle Function Id
        address functionId;
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

    function switchboard() internal view returns (address) {
        return diamondStorage().switchboard;
    }

    function functionId() internal view returns (address) {
        return diamondStorage().functionId;
    }

    function setSwitchboard(address _switchboard) internal {
        diamondStorage().switchboard = _switchboard;
    }

    function setFunctionId(address _functionId) internal {
        diamondStorage().functionId = _functionId;
    }
}
