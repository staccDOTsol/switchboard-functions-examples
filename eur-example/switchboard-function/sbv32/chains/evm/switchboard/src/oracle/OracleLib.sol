//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

library OracleLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.oracle.storage");

    struct Oracle {
        string name;
        address signer;
        uint8 numRows;
        uint256 lastHeartbeat;
        address queueId;
        address authority;
    }

    struct DiamondStorage {
        mapping(address => Oracle) oracles;
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

    function oracles(
        address oracleId
    ) internal view returns (OracleLib.Oracle storage) {
        return diamondStorage().oracles[oracleId];
    }

    function oracleExists(address oracleId) internal view returns (bool) {
        return diamondStorage().oracles[oracleId].signer != address(0);
    }

    function setOracleConfig(
        address oracleId,
        string calldata name,
        address signer,
        address queueId,
        address authority
    ) internal {
        Oracle storage oracle = diamondStorage().oracles[oracleId];
        oracle.name = name;
        oracle.signer = signer;
        oracle.queueId = queueId;
        oracle.authority = authority;
    }

    function setNumRows(address oracleId, uint8 numRows) internal {
        diamondStorage().oracles[oracleId].numRows = numRows;
    }

    function updateLastHeartbeat(address oracleId) internal {
        diamondStorage().oracles[oracleId].lastHeartbeat = block.timestamp;
    }
}
