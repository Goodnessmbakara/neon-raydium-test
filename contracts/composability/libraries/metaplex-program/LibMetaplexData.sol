// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Constants } from "../Constants.sol";
import { LibSystemData } from "../system-program/LibSystemData.sol";
import { LibMetaplexErrors } from "./LibMetaplexErrors.sol";
import { QueryAccount } from "../../../precompiles/QueryAccount.sol";
import { SolanaDataConverterLib } from "../../../utils/SolanaDataConverterLib.sol";

import { ICallSolana } from '../../../precompiles/ICallSolana.sol';

/// @title LibMetaplexData
/// @notice Helper library for getting data from Solana's Metaplex program
/// @author maxpolizzo@gmail.com
library LibMetaplexData {
    using SolanaDataConverterLib for bytes;

    ICallSolana public constant CALL_SOLANA = ICallSolana(0xFF00000000000000000000000000000000000006);

    // See: https://github.com/metaplex-foundation/mpl-token-metadata/blob/23aee718e723578ee5df411f045184e0ac9a9e63/programs/token-metadata/program/src/state/metadata.rs#L16
    // and: https://github.com/metaplex-foundation/mpl-token-metadata/blob/23aee718e723578ee5df411f045184e0ac9a9e63/clients/rust/src/lib.rs#L19
    uint8 public constant MAX_NAME_LENGTH = 32;
    uint8 public constant MAX_SYMBOL_LENGTH = 10;
    uint8 public constant MAX_URI_LENGTH = 200;
    uint8 public constant MAX_CREATOR_LIMIT = 5;
    uint8 public constant MAX_CREATOR_LEN = 34;
    uint16 public constant MAX_DATA_SIZE = 431;
    uint16 public constant MAX_METADATA_LEN = 607;
    // See: https://github.com/metaplex-foundation/mpl-token-metadata/blob/23aee718e723578ee5df411f045184e0ac9a9e63/programs/token-metadata/program/src/state/fee.rs#L14
    uint16 public constant CREATE_FEE_SCALAR = 1308;
    uint16 public constant CREATE_FEE_OFFSET = 5440;

    struct TokenMetadata {
        string tokenName;
        string tokenSymbol;
        string uri;
        bool isMutable;
        bytes32 updateAuthority;
    }

    /// @notice Function to get the 32 bytes program derived address (PDA) derived from a token mint
    /// and Solana's Metaplex program Id
    /// @param tokenMint The 32 bytes public key of the token mint
    function getMetadataPDA(
        bytes32 tokenMint
    ) internal view returns(bytes32) {
        return CALL_SOLANA.getSolanaPDA(
            Constants.getMetaplexProgramId(),
            abi.encodePacked(
                'metadata',
                Constants.getMetaplexProgramId(),
                tokenMint
            )
        );
    }

    /// @notice Function to get Solana's Metaplex program creation fee for a token metadata account
    function getMetaplexCreateFee(bytes memory rentDataBytes) internal pure returns(uint64) {
        // See: https://github.com/metaplex-foundation/mpl-token-metadata/blob/23aee718e723578ee5df411f045184e0ac9a9e63/programs/token-metadata/program/src/state/fee.rs#L17
        return  CREATE_FEE_OFFSET + LibSystemData.getRentExemptionBalance(CREATE_FEE_SCALAR, rentDataBytes);
    }

    // @notice Function to validate provided token metadata
    function validateTokenMetadata(
        string memory tokenName,
        string memory tokenSymbol,
        string memory tokenUri
    ) internal pure {
        // See: https://github.com/metaplex-foundation/mpl-token-metadata/blob/23aee718e723578ee5df411f045184e0ac9a9e63/programs/token-metadata/program/src/assertions/metadata.rs#L22
        require(
            bytes(tokenName).length <= MAX_NAME_LENGTH,
            LibMetaplexErrors.InvalidTokenMetadata()
        );
        require(
            bytes(tokenSymbol).length <= MAX_SYMBOL_LENGTH,
            LibMetaplexErrors.InvalidTokenMetadata()
        );
        require(
            bytes(tokenUri).length <= MAX_URI_LENGTH,
            LibMetaplexErrors.InvalidTokenMetadata()
        );
    }

    // @notice Function to get deserialized token metadata
    function getDeserializedMetadata(bytes32 tokenMint) internal view returns(TokenMetadata memory) {
        (bool success, bytes memory data) = QueryAccount.data(
            uint256(LibMetaplexData.getMetadataPDA(tokenMint)),
            0,
            MAX_METADATA_LEN
        );
        require(success, LibMetaplexErrors.MetadataAccountDataQuery());

        return TokenMetadata (
            string(sliceBytes(data, 69, 32)), // 32 utf-8 bytes token name
            string(sliceBytes(data, 105, 10)), // 10 utf-8 bytes token symbol
            string(sliceBytes(data, 119, 200)), // 200 utf-8 bytes token uri
            toBool(sliceBytes(data, 323, 1)), // 1 byte isMutable flag
            data.toBytes32(1) // 32 bytes token metadata update authority public key
        );
    }

    function sliceBytes(bytes memory _bytes, uint256 _start, uint256 _length) private pure returns (bytes memory){
        require(_bytes.length >= _start + _length, LibMetaplexErrors.BytesSliceOutOfBounds());

        bytes memory tempBytes;
        if(_length == 0) return tempBytes;

        assembly {
            // Have tempBytes point to the current free memory pointer
            tempBytes := mload(0x40)
            // Calculate length % 32 to get the length of the first slice (the first slice may be less that 32 bytes)
            // while all slices after will be 32 bytes)
            let firstSliceLength := and(_length, 31) // &(x, n-1) == x % n
            // Calculate 32 bytes slices count (excluding the first slice)
            let fullSlicesCount := div(_length, 0x20)
            // Calculate the start position of the first 32 bytes slice to copy, which will include the first slice and
            // some extra data on the left that we will discard
            let firstSliceStartPosition := add(add(_bytes, _start), sub(0x20, firstSliceLength))
            // Calculate the end position of the last slice to copy
            let lastSliceEndPosition := add(add(firstSliceStartPosition, 0x20), mul(fullSlicesCount, 0x20))
            // Calculate the position where we will copy the first 32 bytes of data, which will include the first slice
            // and some extra data on the left that we will discard
            let firstSliceCopyPosition := add(tempBytes, sub(0x20, firstSliceLength))
            // Copy slices in memory
            for {
                let nextSliceStartPosition := firstSliceStartPosition
                let nextSliceCopyPosition := firstSliceCopyPosition
            }
            lt(nextSliceStartPosition, lastSliceEndPosition)
            {
                // Update the start position of the next slice to copy
                nextSliceStartPosition := add(nextSliceStartPosition, 0x20)
                // Update the position where we will copy the next slice
                nextSliceCopyPosition := add(nextSliceCopyPosition, 0x20)
            } {
                // Copy the slice
                mcopy(nextSliceCopyPosition, nextSliceStartPosition, 0x20)
            }
            // Store copied data length a the tempBytes position, overwriting extra data that was copied
            mstore(tempBytes, _length)
            // Update the free memory pointer to: tempBytes position + 32 bytes length + (32 bytes * fullSlicesCount)
            // + 32 bytes for the first slice (if it has non-zero length)
            mstore(0x40, add(add(tempBytes, 0x20), add(mul(fullSlicesCount, 0x20), mul(sub(1, iszero(firstSliceLength)), 0x20))))
        }

        return tempBytes;
    }

    function toBool(bytes memory data) private pure returns (bool result) {
        assembly {
            result := shr(0xF8, mload(add(data, 0x20)))
        }
    }
}
