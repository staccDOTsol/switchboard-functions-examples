//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {ISwitchboard} from "./ISwitchboard.sol";

// FunctionsClient is a base contract for interacting with Switchboard Functions
// It provides a simple interface for calling functions and receiving callbacks
abstract contract FunctionsClient {
    error InvalidMsgDataLength(address expected, address sender);
    error InvalidSender(address expected, address sender);

    enum CallbackType {
        UNCALLED,
        CALLBACK_STRING,
        CALLBACK_UINT256,
        CALLBACK_INT256,
        CALLBACK_BYTES
    }

    //=========================================================================
    // Function Client Configuration
    //=========================================================================

    // Switchboard address & FunctionId that will call into this Contract
    address public switchboard;
    address public functionId;

    // Received Latest Value from Switchboard Function
    uint256 public latestCallbackTimestamp;
    CallbackType public latestCallbackType;
    address public latestCallbackCallId;

    //=========================================================================
    // Responses - unused vals and fns can be safely deleted to save gas
    //=========================================================================

    // If callback value is a uint256
    uint256 public latestValueUint256;

    // If callback value is an int256
    int256 public latestValueInt256;

    // If callback value is a bytes
    bytes public latestValueBytes;

    // If callback value is a string
    string public latestValueString;

    constructor(address _switchboard) {
        switchboard = _switchboard;
    }

    //=========================================================================
    // User Function - called upon receiving a callback from switchboard
    //=========================================================================

    function onCallback() internal virtual;

    function initializeRequest(
        string[] memory params // arbitrary user-defined parameters handled function-side
    ) internal returns (address callId) {
        callId = ISwitchboard(switchboard).callFunction{value: msg.value}(
            functionId,
            abi.encode(params)
        );
    }

    //=========================================================================
    // Callbacks - unused callbacks can be safely removed to save gas
    //=========================================================================

    function callbackUint256(uint256 value) public onlyCallback {
        latestValueUint256 = value;
        latestCallbackType = CallbackType.CALLBACK_UINT256;
    }

    function callbackInt256(int256 value) public onlyCallback {
        latestValueInt256 = value;
        latestCallbackType = CallbackType.CALLBACK_INT256;
    }

    function callbackBytes(bytes memory value) public onlyCallback {
        latestValueBytes = value;
        latestCallbackType = CallbackType.CALLBACK_BYTES;
    }

    function callbackString(string memory value) public onlyCallback {
        latestValueString = value;
        latestCallbackType = CallbackType.CALLBACK_STRING;
    }

    //=========================================================================
    // Callbacks with callId - can also be removed if unneeded
    //=========================================================================
    function callbackUint256WithId(uint256 value, address callId) external {
        latestCallbackCallId = callId;
        callbackUint256(value);
    }

    function callbackInt256WithId(int256 value, address callId) external {
        latestCallbackCallId = callId;
        callbackInt256(value);
    }

    function callbackBytesWithId(bytes memory value, address callId) external {
        latestCallbackCallId = callId;
        callbackBytes(value);
    }

    function callbackStringWithId(
        string memory value,
        address callId
    ) external {
        latestCallbackCallId = callId;
        callbackString(value);
    }

    //=========================================================================
    // Internal functions / modifiers
    //=========================================================================

    // get encoded functionId from msg.data and check that switchboard sent the message
    function getFunctionId() internal view returns (address payable signer) {
        signer = payable(msg.sender);
        if (msg.data.length < 20) {
            // log signer if called with wrong account
            revert InvalidMsgDataLength(switchboard, signer);
        } else if (msg.data.length >= 20 && signer == switchboard) {
            assembly {
                signer := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        }
    }

    // check if the functionId is valid and trigger onCallback
    modifier onlyCallback() {
        address encodedFunctionId = getFunctionId();

        // set functionId to the sender if it's empty and the sender is the switchboard
        if (functionId == address(0) && msg.sender == switchboard) {
            functionId = encodedFunctionId;
        }

        // make sure the encoded caller is our function id
        if (encodedFunctionId != functionId) {
            revert InvalidSender(functionId, encodedFunctionId);
        }

        _;

        latestCallbackTimestamp = block.timestamp;
        onCallback();
    }
}
