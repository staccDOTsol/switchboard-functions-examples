//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./eip2535/Diamond.sol";

contract Switchboard is Diamond {
    constructor(
        address _contractOwner,
        address _diamondCutFacet
    ) Diamond(_contractOwner, _diamondCutFacet) {}
}
