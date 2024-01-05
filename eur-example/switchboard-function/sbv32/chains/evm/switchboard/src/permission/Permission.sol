//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {PermissionLib} from "./PermissionLib.sol";

contract Permission {
    function getPermission(
        address granter,
        address grantee
    ) external view returns (uint256) {
        PermissionLib.DiamondStorage storage ds = PermissionLib
            .diamondStorage();
        return ds.permissions[granter][grantee];
    }

    function hasPermission(
        address granter,
        address grantee,
        uint256 permission
    ) external view returns (bool) {
        return PermissionLib.hasPermission(granter, grantee, permission);
    }
}
