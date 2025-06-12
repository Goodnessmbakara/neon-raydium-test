// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { CallSolanaHelperLib } from '../utils/CallSolanaHelperLib.sol';
import { Constants } from "./libraries/Constants.sol";
import { LibSystemData } from "./libraries/system-program/LibSystemData.sol";
import { LibSPLTokenData } from "./libraries/spl-token-program/LibSPLTokenData.sol";
import { LibSPLTokenErrors } from "./libraries/spl-token-program/LibSPLTokenErrors.sol";
import { LibMetaplexData } from "./libraries/metaplex-program/LibMetaplexData.sol";
import { LibMetaplexErrors } from "./libraries/metaplex-program/LibMetaplexErrors.sol";
import { LibMetaplexProgram } from "./libraries/metaplex-program/LibMetaplexProgram.sol";

import { ICallSolana } from '../precompiles/ICallSolana.sol';

/// @title CallMetaplexProgram
/// @notice Example contract showing how to use LibMetaplexProgram and LibMetaplexData libraries to interact with
/// Solana's Metaplex program
/// @author maxpolizzo@gmail.com
contract CallMetaplexProgram {
    ICallSolana public constant CALL_SOLANA = ICallSolana(0xFF00000000000000000000000000000000000006);

    /// @notice This function creates a new Metadata account associated with a token mint, and stores provided token
    /// metadata on it (token name, token symbol and uri). Stored metadata can be mutable if the isMutable parameter is
    /// set to `true`. The token mint account is derived from msg.sender and the seed the was used to create it as a
    /// form of authentication (only the account which created the token mint is allowed to create the token metadata
    /// account associated to it)
    function createTokenMetadataAccount(
        bytes memory seed,
        string calldata tokenName,
        string calldata tokenSymbol,
        string calldata tokenUri,
        bool isMutable
    ) external {
        // Authentication: we derive the token mint account from msg.sender and seed
        bytes32 tokenMint = getTokenMintAccount(msg.sender, seed);
        // Verify that there is no existing metadata account already associated with this token mint
        bytes32 metadataPDA = LibMetaplexData.getMetadataPDA(tokenMint);
        require(
            LibSystemData.getSpace(metadataPDA) == 0,
            LibMetaplexErrors.MetadataAlreadyExists(
                tokenMint,
                metadataPDA
            )
        );
        // Check that this contract is the current token mint's MINT authority (only token mint's MINT authority can
        // create a metadata account associated with this token mint)
        bytes32 thisContractPubKey = CALL_SOLANA.getNeonAddress(address(this));
        bytes32 mintAuthority = LibSPLTokenData.getSPLTokenMintAuthority(tokenMint);
        require(
            thisContractPubKey == mintAuthority,
            LibSPLTokenErrors.InvalidMintAuthority(
                tokenMint,
                mintAuthority,
                thisContractPubKey
            )
        );
        // Get the payer account which will pay to fund the metadata account creation
        bytes32 payer = CALL_SOLANA.getPayer();
        // Format createMetadataAccountV3 instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data,
            uint64 lamports
        ) = LibMetaplexProgram.formatCreateMetadataAccountV3Instruction(
            tokenMint,
            metadataPDA,
            payer,
            thisContractPubKey, // This contract has MINT authority on the token mint
            thisContractPubKey, // This contract will have UPDATE authority on the created metadata account
            tokenName,
            tokenSymbol,
            tokenUri,
            isMutable
        );
        // Prepare createMetadataAccountV3 instruction
        bytes memory createMetadataAccountV3Ix = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getMetaplexProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute createMetadataAccountV3 instruction
        // Neon proxy operator is asked to send the `lamports` SOL amount with the transaction in order to pay for
        // Solana's Metaplex program fee and for the created metadata account's rent
        CALL_SOLANA.execute(lamports, createMetadataAccountV3Ix);
    }

    /// @notice This function updates an existing Metadata account associated with a token mint, storing new
    /// token metadata on it (token name, token symbol and uri). Stored metadata can be mutable if the isMutable
    /// parameter is set to `true`. The token mint account is derived from msg.sender and the seed the was used to create
    /// it as a form of authentication (only the account which created the token mint is allowed to update the token
    /// metadata account associated to it). It is also possible to set the metadata account's UPDATE authority by
    /// passing a non-zero `newUpdateAuthority` public key to the function. Passing bytes32(0) as `newUpdateAuthority`
    /// will not change the metadata account's UPDATE authority.
    function updateTokenMetadataAccount(
        bytes memory seed,
        string calldata newTokenName,
        string calldata newTokenSymbol,
        string calldata newTokenUri,
        bytes32 newUpdateAuthority,
        bool isMutable
    ) external {
        // Authentication: we derive the token mint account from msg.sender and seed
        bytes32 tokenMint = getTokenMintAccount(msg.sender, seed);

        // Format updateMetadataAccountV2 instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibMetaplexProgram.formatUpdateMetadataAccountV2Instruction(
            tokenMint,
            newUpdateAuthority, // New update authority
            newTokenName,
            newTokenSymbol,
            newTokenUri,
            isMutable
        );
        // Prepare updateMetadataAccountV2 instruction
        bytes memory updateMetadataAccountV2Ix = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getMetaplexProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute updateMetadataAccountV2 instruction
        CALL_SOLANA.execute(0, updateMetadataAccountV2Ix);
    }

    // Returns Solana public key for NeonEVM address
    function getNeonAddress(address user) external view virtual returns (bytes32) {
        return CALL_SOLANA.getNeonAddress(user);
    }

    // Returns the token mint account derived from provided owner and seed
    function getTokenMintAccount(address owner, bytes memory seed) public view virtual returns(bytes32) {
        return CALL_SOLANA.getResourceAddress(sha256(abi.encodePacked(
            owner, // account that created and owns the token mint
            seed // Seed that has been used to create token mint
        )));
    }

    // Metadata account data getters

    /// @notice Function to get the 32 bytes program derived address (PDA) derived from a token mint
    /// and Solana's Metaplex program Id
    /// @param tokenMint The 32 bytes public key of the token mint
    function getMetadataPDA(
        bytes32 tokenMint
    ) external view returns(bytes32) {
        return LibMetaplexData.getMetadataPDA(tokenMint);
    }

    /// @notice Function to get Solana's Metaplex program creation fee for a token metadata account
    function getMetaplexCreateFee() external view returns(uint64) {
        // Get latest rent data from Solana's Sysvar rent account
        bytes memory rentDataBytes = LibSystemData.getSystemAccountData(
            Constants.getSysvarRentPubkey(),
            LibSystemData.getSpace(Constants.getSysvarRentPubkey())
        );
        return LibMetaplexData.getMetaplexCreateFee(rentDataBytes);
    }

    /// @notice Function to get the token metadata stored by a token metadata account
    /// @param tokenMint The 32 bytes public key of the token mint
    function getTokenMetadata(
        bytes32 tokenMint
    ) external view returns(LibMetaplexData.TokenMetadata memory) {
        return LibMetaplexData.getDeserializedMetadata(tokenMint);
    }

    /// @notice Function to get the token name from a token metadata account
    /// @param tokenMint The 32 bytes public key of the token mint associated with the token metadata account
    function getTokenName(
        bytes32 tokenMint
    ) external view returns(string memory) {
        return LibMetaplexData.getDeserializedMetadata(tokenMint).tokenName;
    }

    /// @notice Function to get the token symbol from a token metadata account
    /// @param tokenMint The 32 bytes public key of the token mint associated with the token metadata account
    function getTokenSymbol(
        bytes32 tokenMint
    ) external view returns(string memory) {
        return LibMetaplexData.getDeserializedMetadata(tokenMint).tokenSymbol;
    }

    /// @notice Function to get the token uri from a token metadata account
    /// @param tokenMint The 32 bytes public key of the token mint associated with the token metadata account
    function getUri(
        bytes32 tokenMint
    ) external view returns(string memory) {
        return LibMetaplexData.getDeserializedMetadata(tokenMint).uri;
    }

    /// @notice Function to get the isMutable boolean value from a token metadata account
    /// @param tokenMint The 32 bytes public key of the token mint associated with the token metadata account
    function getMetadataIsMutable(
        bytes32 tokenMint
    ) external view returns(bool) {
        return LibMetaplexData.getDeserializedMetadata(tokenMint).isMutable;
    }

    /// @notice Function to get the public key of the account which has UPDATE authority over a token metadata account
    /// @param tokenMint The 32 bytes public key of the token mint associated with the token metadata account
    function getMetadataUpdateAuthority(
        bytes32 tokenMint
    ) external view returns(bytes32) {
        return LibMetaplexData.getDeserializedMetadata(tokenMint).updateAuthority;
    }
}
