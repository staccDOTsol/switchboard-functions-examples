// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";

// import "../src/aggregator/AggregatorLib.sol";
// import "../src/aggregator/SortLib.sol";

// contract TestSortLib is Test {
  // // [24510, 24750, 24400, 24250, 24500]
  // // [24510000000, 24750000000, 24400000000, 24250000000, 24500000000]
  // AggregatorLib.Result[] results;
//
  // function setUp() public {
    // vm.label(address(this), "SortLib test contract");
    // results.push(
      // AggregatorLib.Result(24510000000, block.timestamp, msg.sender)
    // );
    // results.push(
      // AggregatorLib.Result(24750000000, block.timestamp, msg.sender)
    // );
    // results.push(
      // AggregatorLib.Result(24400000000, block.timestamp, msg.sender)
    // );
    // results.push(
      // AggregatorLib.Result(24250000000, block.timestamp, msg.sender)
    // );
    // results.push(
      // AggregatorLib.Result(24500000000, block.timestamp, msg.sender)
    // );
    // assertEq(results.length, 5);
//
    // assertEq(24510000000, results[0].value);
    // assertEq(24750000000, results[1].value);
    // assertEq(24400000000, results[2].value);
    // assertEq(24250000000, results[3].value);
    // assertEq(24500000000, results[4].value);
  // }
//
  // function test_SortResults() public {
    // AggregatorLib.Result[] memory sorted = SortLib.insertionSortResults(
      // results
    // );
//
    // assertEq(sorted.length, 5);
//
    // assertEq(24250000000, sorted[0].value);
    // assertEq(24400000000, sorted[1].value);
    // assertEq(24500000000, sorted[2].value);
    // assertEq(24510000000, sorted[3].value);
    // assertEq(24750000000, sorted[4].value);
  // }
//
  // function test_GetMedian(
    // AggregatorLib.Result[] memory my_results
  // ) public pure {
    // vm.assume(my_results.length > 0 && my_results.length < 20);
    // SortLib.getMedian(my_results);
  // }
//
  // function getGasCostOfMedian(
    // AggregatorLib.Result[] memory my_results
  // ) public view returns (uint256) {
    // uint256 gasBefore = gasleft();
    // SortLib.getMedian(my_results);
    // return gasBefore - gasleft();
  // }
//
  // function test_GetMedianOddLength() public {
    // (int256 medianValue, ) = SortLib.getMedian(results);
    // assertEq(24500000000, medianValue);
  // }
//
  // // [24510, 24750, 24490, 24250, 24500, 24508]
  // function test_GetMedianEvenLength() public {
    // results.push(
      // AggregatorLib.Result(24508000000, block.timestamp, msg.sender)
    // ); // 24,508
    // assertEq(24508000000, results[5].value);
//
    // (int256 medianValue, ) = SortLib.getMedian(results);
    // assertEq(24504000000, medianValue);
  // }
// }
