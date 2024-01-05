//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./eip2535/Diamond.sol";

// This contract is the diamond contract that will be deployed.
// The core logic can be found at ./Receiver/Receiver.sol
// Admin functionality in ./Admin/Admin.sol
contract SwitchboardPushReceiver is Diamond {
  constructor(
    address _contractOwner,
    address _diamondCutFacet
  ) Diamond(_contractOwner, _diamondCutFacet) {}
}
