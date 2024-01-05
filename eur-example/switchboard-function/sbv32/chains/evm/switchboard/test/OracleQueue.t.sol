// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "forge-std/Test.sol";

import "../src/Switchboard.sol";

contract TestOracleQueue is Test {
  Switchboard public switchboard;

  function setUp() public {
    switchboard = new Switchboard(address(0), address(0));
  }

  function test_log() public view {
    console.log("done");
  }

  // function test_createQueue() public {
  //     address queue_authority = vm.addr(1337);
  //     deal(queue_authority, 10);

  //     string memory _name = "test_queue";

  //     vm.prank(queue_authority);

  //     // create a new queue
  //     switchboard.createOracleQueue(
  //         _name,
  //         queue_authority,
  //         true, // unpermissionedFeedsEnabled
  //         10, // max size
  //         0, // reward
  //         3600 // oracle timeout
  //     );

  //     // get all of the queues for this address
  //     (
  //         address[] memory queue_addresses,
  //         SwitchboardStructs.Aggregator[] memory queues
  //     ) = switchboard.getAggregatorsByAuthority(queue_authority);
  //     assertEq(queue_addresses.length, 1);
  //     assertEq(queues.length, 1);

  //     // vm.expectEmit(true, true, true, false);

  //     // Notice that your entries are <Interface>.Log[]
  //     // as opposed to <instance>.Log[]
  //     // Vm.Log[] memory entries = vm.getRecordedLogs();
  //     // assertEq(entries.length, 1);
  // }

  // function test_createAggregator() public {}
}
