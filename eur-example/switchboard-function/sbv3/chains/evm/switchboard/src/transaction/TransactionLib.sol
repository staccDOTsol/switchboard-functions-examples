//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {ECDSA} from "./ECDSA.sol";
import {ErrorLib} from "../errors/ErrorLib.sol";

library TransactionLib {
    bytes32 constant DIAMOND_STORAGE_POSITION =
        keccak256("switchboard.transaction.storage");
    bytes32 constant EIP712_TRANSACTION_SCHEMA_HASH =
        keccak256(
            "Transaction(uint256 expirationTimeSeconds,uint256 gasLimit,uint256 value,address to,address from,bytes data)"
        );
    bytes32 constant EIP712_DOMAIN_SCHEMA_HASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    struct Transaction {
        uint256 expirationTimeSeconds;
        uint256 gasLimit;
        uint256 value;
        address to;
        address from;
        bytes data;
    }

    struct DiamondStorage {
        mapping(bytes32 => bool) executedTransactions; // txs that have been executed
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

    function setTxHashToExecuted(bytes32 txHash) internal {
        diamondStorage().executedTransactions[txHash] = true;
    }

    function sliceBytes32(
        bytes memory b,
        uint256 index
    ) internal pure returns (bytes32 result) {
        if (b.length < index + 32) {
            revert ErrorLib.InvalidArgument(0);
        }
        index += 32;
        assembly {
            result := mload(add(b, index))
        }
    }

    function isTxHashAlreadyExecuted(
        bytes32 txHash
    ) internal view returns (bool) {
        return diamondStorage().executedTransactions[txHash];
    }

    // https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/049482f3f027d1054b47d294aad594d912b2c472/contracts/utils/AddressUpgradeable.sol#L157
    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        if (success) {
            if (returndata.length == 0) {
                // only check if target is a contract if the call was successful and the return data is empty
                // otherwise we already know that it was a contract
                require(
                    target.code.length > 0,
                    "Address: call to non-contract"
                );
            }
            return returndata;
        } else {
            _revert(returndata, errorMessage);
        }
    }

    // https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/049482f3f027d1054b47d294aad594d912b2c472/contracts/utils/AddressUpgradeable.sol#L193
    function _revert(
        bytes memory returndata,
        string memory errorMessage
    ) internal pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            /// @solidity memory-safe-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert(errorMessage);
        }
    }

    function isValidTransactionSignature(
        address sender,
        bytes32 txHash,
        bytes memory signature
    ) internal pure returns (bool) {
        if (signature.length != 65) {
            return false;
        }

        address result = ECDSA.recover(txHash, signature);
        if (result == address(0)) {
            return false;
        }

        return result == sender;
    }

    function isNullTx(
        Transaction memory transaction
    ) internal pure returns (bool) {
        return transaction.data.length == 0 && transaction.value == 0;
    }

    function getTransactionHash(
        Transaction memory transaction
    ) internal view returns (bytes32) {
        bytes32 transactionStructHash = getTransactionDataHash(transaction);
        address verifyingContract = address(this);

        bytes32 domainHash = keccak256(
            abi.encode(
                EIP712_DOMAIN_SCHEMA_HASH,
                keccak256(bytes("Switchboard")),
                keccak256(bytes("0.0.1")),
                block.chainid,
                verifyingContract
            )
        );

        // https://eips.ethereum.org/EIPS/eip-712#specification
        return
            keccak256(
                abi.encodePacked("\x19\x01", domainHash, transactionStructHash)
            );
    }

    function validateTransaction(
        DiamondStorage storage ds,
        Transaction memory transaction,
        bytes memory signature
    ) internal {
        bytes32 txHash = getTransactionHash(transaction);
        if (ds.executedTransactions[txHash]) {
            revert ErrorLib.AlreadyExecuted(txHash);
        } else {
            ds.executedTransactions[txHash] = true;
        }

        // check that the signature for the current tx is valid
        bool isValidSignature = isValidTransactionSignature(
            transaction.from,
            txHash,
            signature
        );

        if (!isValidSignature) {
            revert ErrorLib.InvalidSignature(
                transaction.from,
                txHash,
                signature
            );
        }
    }

    function getTransactionDataHash(
        Transaction memory transaction
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_TRANSACTION_SCHEMA_HASH,
                    // transaction fields
                    transaction.expirationTimeSeconds,
                    transaction.gasLimit,
                    transaction.value,
                    transaction.to,
                    transaction.from,
                    keccak256(transaction.data)
                )
            );
    }
}
