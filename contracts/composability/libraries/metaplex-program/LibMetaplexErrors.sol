// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title LibMetaplexErrors
/// @notice Custom errors library for interactions with Solana's Metaplex program
/// @author maxpolizzo@gmail.com
library LibMetaplexErrors {
    // Invalid UPDATE authority error
    error InvalidUpdateAuthority(bytes32 metadataPDA, bytes32 updateAuthority, bytes32 invalidAuthority);

    // Metadata account already created error
    error MetadataAlreadyExists(bytes32 tokenMint, bytes32 metadataPDA);

    // Immutable metadata account error
    error ImmutableMetadata(bytes32 tokenMint);

    // Metadata validation error
    error InvalidTokenMetadata();

    // Metadata account data query errors
    error MetadataAccountDataQuery();
    error BytesSliceOutOfBounds();
}
