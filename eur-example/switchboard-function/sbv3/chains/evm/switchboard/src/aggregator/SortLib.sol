//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {AggregatorLib} from "./AggregatorLib.sol"; // sort library is dependent on Switchboard Result Struct

// sort library for SbStructs.Result type
// https://medium.com/coinmonks/sorting-in-solidity-without-comparison-4eb47e04ff0d
library SortLib {
    // https://ethereum.stackexchange.com/a/96382
    function avgUint256(
        uint256 x,
        uint256 y
    ) internal pure returns (uint256 result) {
        unchecked {
            result = (x >> 1) + (y >> 1) + (x & y & 1);
        }
    }

    function avgInt256(
        int256 x,
        int256 y
    ) internal pure returns (int256 result) {
        return (x / 2) + (y / 2) + (((x % 2) + (y % 2)) / 2);
    }

    // get median value, timestamp
    function getMedian(
        AggregatorLib.Result[] memory arr
    ) internal pure returns (int256, uint256) {
        // require(arr.length > 0); // dont need this if we check before calling
        AggregatorLib.Result[] memory sorted = insertionSortResults(arr);
        if (arr.length % 2 == 0) {
            return (
                avgInt256(
                    sorted[arr.length / 2].value,
                    sorted[arr.length / 2 - 1].value
                ),
                avgUint256(
                    sorted[arr.length / 2].timestamp,
                    sorted[arr.length / 2 - 1].timestamp
                )
            );
        } else {
            return (
                sorted[arr.length / 2].value,
                sorted[arr.length / 2].timestamp
            );
        }
    }

    // this may or may not be more gas efficient for arrays less than 20 elements
    function insertionSortResults(
        AggregatorLib.Result[] memory arr
    ) internal pure returns (AggregatorLib.Result[] memory) {
        uint256 n = arr.length;
        if (n < 2) {
            return arr;
        }

        for (uint i = 1; i < n; i++) {
            AggregatorLib.Result memory key = arr[i];
            int j = int(i - 1);
            while (j >= 0 && arr[uint(j)].value > key.value) {
                arr[uint(j + 1)] = arr[uint(j)];
                j--;
            }
            arr[uint(j + 1)] = key;
        }
        return arr;
    }
}
