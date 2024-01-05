//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {ErrorLib} from "../errors/ErrorLib.sol";

library UtilLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.util.storage");

    struct DiamondStorage {
        uint256 nonce;
        uint256 code;
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

    // Setting the code is only possible upon entry

    function getCode() internal view returns (uint256) {
        return diamondStorage().code;
    }

    function setCode(uint256 code) internal {
        diamondStorage().code = code;
    }

    // Checking entry codes / permissions in downstream functions

    function hasEntryCode(uint256 code) internal view returns (bool) {
        return diamondStorage().code & code != 0;
    }

    function generateId() internal returns (address) {
        bytes32 h = keccak256(
            abi.encodePacked(
                ++diamondStorage().nonce,
                blockhash(block.number - 1)
            )
        );
        return address(uint160(uint256(h)));
    }

    // Utility functions

    function containsBytes32(
        bytes32[] memory arr,
        bytes32 value
    ) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == value) {
                return true;
            }
        }
        return false;
    }

    function indexOfBytes32(
        bytes32[] memory arr,
        bytes32 value
    ) internal pure returns (int256) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == value) {
                return int256(i);
            }
        }
        return -1;
    }

    function containsAddress(
        address[] memory arr,
        address value
    ) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == value) {
                return true;
            }
        }
        return false;
    }

    function abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }
}
