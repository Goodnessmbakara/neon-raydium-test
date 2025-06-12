// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Constants } from "../Constants.sol";
import { LibMetaplexData } from "./LibMetaplexData.sol";
import { LibMetaplexErrors } from "./LibMetaplexErrors.sol";
import { LibSystemData } from "../system-program/LibSystemData.sol";
import { SolanaDataConverterLib } from "../../../utils/SolanaDataConverterLib.sol";

import { ICallSolana } from '../../../precompiles/ICallSolana.sol';

/// @title LibMetaplexProgram
/// @notice Helper library for interactions with Solana's Metaplex program
/// @author maxpolizzo@gmail.com
library LibMetaplexProgram {
    ICallSolana public constant CALL_SOLANA = ICallSolana(0xFF00000000000000000000000000000000000006);

    /// @notice Helper function to format a `createMetadataAccountV3` instruction in order to create a metadata account
    /// derived from a token mint account public key and Solana's Metaplex program Id
    /// @param tokenMint The token mint account's public key with which the metadata will be associated
    /// @param payer The public key of the payer account which will fund the newly created metadata account
    /// @param mintAuthority The public key of the account that has MINT authority over the token mint account
    /// @param updateAuthority The public key of the account that will have UPDATE authority over the newly created
    /// metadata account
    /// @param tokenName The token's name to be stored by the newly created metadata account
    /// @param tokenSymbol The token's symbol to be stored by the newly created metadata account
    /// @param tokenUri A URI associated with the token to be stored by the newly created metadata account (could be a
    /// logo URI for instance)
    /// @param isMutable A boolean indicating whether the data stored by the newly created metadata account can be
    /// modified by the updateAuthority account
    function formatCreateMetadataAccountV3Instruction(
        bytes32 tokenMint,
        bytes32 metadataPDA,
        bytes32 payer,
        bytes32 mintAuthority,
        bytes32 updateAuthority,
        string calldata tokenName,
        string calldata tokenSymbol,
        string calldata tokenUri,
        bool isMutable
    ) internal view returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data,
        uint64 lamports
    ) {
        // Validate provided token metadata
        LibMetaplexData.validateTokenMetadata(tokenName, tokenSymbol, tokenUri);

        accounts = new bytes32[](6);
        accounts[0] = metadataPDA;
        accounts[1] = tokenMint;
        accounts[2] = mintAuthority;
        accounts[3] = payer;
        accounts[4] = updateAuthority;
        accounts[5] = Constants.getSystemProgramId();

        isSigner = new bool[](6);
        isSigner[2] = true;
        isSigner[3] = true;
        isSigner[4] = true;

        isWritable = new bool[](6);
        isWritable[0] = true;
        isWritable[3] = true;

        // Get values in right-padded little-endian bytes format
        bytes4 tokenNameLenLE = bytes4(SolanaDataConverterLib.readLittleEndianUnsigned32(uint32(bytes(tokenName).length)));
        bytes4 tokenSymbolLenLE = bytes4(SolanaDataConverterLib.readLittleEndianUnsigned32(uint32(bytes(tokenSymbol).length)));
        bytes4 tokenUriLenLE = bytes4(SolanaDataConverterLib.readLittleEndianUnsigned32(uint32(bytes(tokenUri).length)));
        data = abi.encodePacked(
            bytes1(0x21), // Instruction variant (see: https://github.com/metaplex-foundation/mpl-token-metadata/blob/23aee718e723578ee5df411f045184e0ac9a9e63/clients/rust/src/generated/instructions/create_metadata_account_v3.rs#L94)
            tokenNameLenLE, // Token name's utf-8 bytes length (right-padded little-endian)
            tokenName, // Token name's utf-8 bytes
            tokenSymbolLenLE, // Token symbol's utf-8 bytes length (right-padded little-endian)
            tokenSymbol, // Token symbol's utf-8 bytes
            tokenUriLenLE, // Token uri's utf-8 bytes length (right-padded little-endian)
            tokenUri, // Token uri's utf-8 bytes
            bytes2(0x0000), // `sellerFeeBasisPoints` is set to 0
            bytes1(0x00), // No `collection` provided
            bytes1(0x00), // No `creators` provided
            bytes1(0x00), // No `uses` provided
            isMutable ? bytes1(0x01) : bytes1(0x00), // 1 byte `isMutable` boolean
            bytes1(0x00) // No `collectionDetails` provided
        );

        // Calculate the amount of lamports to send when excuting the `createMetadataAccountV3` instruction
        // See: https://github.com/metaplex-foundation/mpl-token-metadata/blob/23aee718e723578ee5df411f045184e0ac9a9e63/programs/token-metadata/program/src/utils/fee.rs#L18
        // Get latest rent data from Solana's Sysvar rent account
        bytes memory rentDataBytes = LibSystemData.getSystemAccountData(
            Constants.getSysvarRentPubkey(),
            LibSystemData.getSpace(Constants.getSysvarRentPubkey())
        );
        // Calculate Solana's Metaplex 'create' fee for metadata account creation
        uint64 metaplexCreateFee = LibMetaplexData.getMetaplexCreateFee(rentDataBytes);
        // Calculate metadata account's rent exemption balance
        uint64 rentExemptBalance = LibSystemData.getRentExemptionBalance(LibMetaplexData.MAX_METADATA_LEN, rentDataBytes);
        // Add Metaplex 'create' fee and metadata account's rent exemption balance
        lamports = metaplexCreateFee + rentExemptBalance;
    }

    /// @notice Helper function to format a `updateMetadataAccountV2` instruction in order to update an existing mutable
    // metadata account
    /// @param tokenMint The token mint account's public key with which the metadata to update is associated
    /// @param newUpdateAuthority The public key of the account that will have UPDATE authority over the updated
    /// metadata account (set this value to `bytes32(0)` to keep the current UPDATE authority account unchanged)
    /// @param newTokenName The updated token's name to be stored by the metadata account
    /// @param newTokenSymbol The updated token's symbol to be stored by the metadata account
    /// @param newTokenUri The updated URI associated with the token to be stored by the metadata account (could be a
    /// logo URI for instance)
    /// @param isMutable A boolean indicating if the data stored by the metadata account can be modified by the
    /// updateAuthority account
    function formatUpdateMetadataAccountV2Instruction(
        bytes32 tokenMint,
        bytes32 newUpdateAuthority,
        string calldata newTokenName,
        string calldata newTokenSymbol,
        string calldata newTokenUri,
        bool isMutable
    ) internal view returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        // Verify that the metadata account associated with this token mint is mutable
        LibMetaplexData.TokenMetadata memory tokenMetadata = LibMetaplexData.getDeserializedMetadata(tokenMint);
        require(
            tokenMetadata.isMutable,
            LibMetaplexErrors.ImmutableMetadata(tokenMint)
        );
        // Derive the token metadata account's public key
        bytes32 metadataPDA = LibMetaplexData.getMetadataPDA(tokenMint);
        // Check that this contract is the current token metadata account's UPDATE authority (only token mint's MINT
        // authority can create a metadata account associated with this token mint)
        bytes32 thisContractPubKey = CALL_SOLANA.getNeonAddress(address(this));
        require(
            thisContractPubKey == tokenMetadata.updateAuthority,
            LibMetaplexErrors.InvalidUpdateAuthority(
                metadataPDA,
                tokenMetadata.updateAuthority,
                thisContractPubKey
            )
        );
        // Validate provided token metadata
        LibMetaplexData.validateTokenMetadata(newTokenName, newTokenSymbol, newTokenUri);

        accounts = new bytes32[](2);
        accounts[0] = metadataPDA;
        accounts[1] = tokenMetadata.updateAuthority;

        isSigner = new bool[](2);
        isSigner[1] = true;

        isWritable = new bool[](2);
        isWritable[0] = true;

        // Get values in right-padded little-endian bytes format
        bytes4 tokenNameLenLE = bytes4(SolanaDataConverterLib.readLittleEndianUnsigned32(uint32(bytes(newTokenName).length)));
        bytes4 tokenSymbolLenLE = bytes4(SolanaDataConverterLib.readLittleEndianUnsigned32(uint32(bytes(newTokenSymbol).length)));
        bytes4 tokenUriLenLE = bytes4(SolanaDataConverterLib.readLittleEndianUnsigned32(uint32(bytes(newTokenUri).length)));
        // Serialize instruction data, including new update authority public key if needed
        data = abi.encodePacked(
            bytes1(0x0f), // Instruction variant (see: https://github.com/metaplex-foundation/mpl-token-metadata/blob/23aee718e723578ee5df411f045184e0ac9a9e63/clients/rust/src/generated/instructions/update_metadata_account_v2.rs#L65
            bytes1(0x01), // Flag to indicate that new token metadata is provided
            tokenNameLenLE, // Token name's utf-8 bytes length (right-padded little-endian)
            newTokenName, // Token name's utf-8 bytes
            tokenSymbolLenLE, // Token symbol's utf-8 bytes length (right-padded little-endian)
            newTokenSymbol, // Token symbol's utf-8 bytes
            tokenUriLenLE, // Token uri's utf-8 bytes length (right-padded little-endian)
            newTokenUri, // Token uri's utf-8 bytes
            bytes2(0x0000), // `sellerFeeBasisPoints` is set to 0
            bytes1(0x00), // No `collection` provided
            bytes1(0x00), // No `creators` provided
            bytes1(0x00), // No `uses` provided
            formatNewUpdateAuthorityWithFlag(newUpdateAuthority),
            bytes1(0x00), // Flag to indicate that no `primarySaleHappened` value is provided
            bytes1(0x01), // Flag to indicate that a `isMutable` value is provided
            isMutable ? bytes1(0x01) : bytes1(0x00) // 1 byte `isMutable` boolean
        );
    }

    function formatNewUpdateAuthorityWithFlag(bytes32 newUpdateAuthority) private pure returns (bytes memory) {
        bytes memory newUpdateAuthorityWithFlag;
        if (newUpdateAuthority == bytes32(0)) {
            assembly {
                newUpdateAuthorityWithFlag := mload(0x40)
                mstore(newUpdateAuthorityWithFlag, 0x01) // Assign length and keep next slot empty (flag is 0x00 in this case)
                mstore(0x40, add(newUpdateAuthorityWithFlag, 0x40)) // Update free memory pointer
            }
        } else {
            assembly {
                newUpdateAuthorityWithFlag := mload(0x40)
                mstore(newUpdateAuthorityWithFlag, 0x21) // Assign length
                mstore8(add(newUpdateAuthorityWithFlag, 0x20), 0x01) // Assign flag to indicate that a new update authority public key is provided
                mstore(add(newUpdateAuthorityWithFlag, 0x21), newUpdateAuthority) // Assign 32 bytes newUpdateAuthority value
                mstore(0x40, add(newUpdateAuthorityWithFlag, 0x60)) // Update free memory pointer
            }
        }

        return newUpdateAuthorityWithFlag;
    }
}
