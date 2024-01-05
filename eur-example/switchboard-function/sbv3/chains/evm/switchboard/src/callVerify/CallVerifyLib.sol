//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {ErrorLib} from "../errors/ErrorLib.sol";

library CallVerifyLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.callVerify.storage");

    struct DiamondStorage {
        // call id => param hash
        mapping(address => bytes32) paramsHashes;
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

    function registerCallParams(address callId, bytes memory params) internal {
        diamondStorage().paramsHashes[callId] = keccak256(params);
    }

    function verify(
        address[] memory callIds,
        bytes32[] memory hashes
    ) internal view {
        DiamondStorage storage ds = diamondStorage();
        for (uint256 i; i < callIds.length; i++) {
            if (ds.paramsHashes[callIds[i]] != hashes[i]) {
                revert ErrorLib.InvalidCallbackParams(callIds[i], hashes[i]);
            }
        }
    }
}
