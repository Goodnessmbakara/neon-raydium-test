// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Constants } from "../Constants.sol";
import { SolanaDataConverterLib } from "../../../utils/SolanaDataConverterLib.sol";
import { LibSPLTokenData } from "./LibSPLTokenData.sol";

/// @title LibSPLTokenProgram
/// @notice Helper library for interactions with Solana's SPL Token program
/// @author maxpolizzo@gmail.com
library LibSPLTokenProgram {
    // See: https://github.com/solana-program/token/blob/c4689b111789e272600f79e213a3d31bb0ae2f3c/program/src/instruction.rs#L753
    enum AuthorityType {
        MINT, // Authority to mint tokens
        FREEZE, // Authority to freeze any account associated with the token mint
        OWNER, // Owner of a token account
        CLOSE // Authority to close a token account
    }

    /// @notice Helper function to format a `initializeMint2` instruction
    /// @param decimals The decimals value for the new token mint to be initialized
    /// @param tokenMint The token mint account to be initialized
    /// @param mintAuthority The account to be granted authority to mint tokens
    /// @param freezeAuthority The account to be granted authority to freeze the token mint
    function formatInitializeMint2Instruction(
        uint8 decimals,
        bytes32 tokenMint,
        bytes32 mintAuthority,
        bytes32 freezeAuthority
    ) internal pure returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        accounts = new bytes32[](1);
        accounts[0] = tokenMint;

        isSigner = new bool[](1);

        isWritable = new bool[](1);
        isWritable[0] = true;

        data = abi.encodePacked(
            bytes1(0x14), // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L558)
            bytes1(decimals), // Token's decimals value
            mintAuthority, // Token's mint authority account
            bytes1(0x01), // Flag set to 1, indicating that freezeAuthority account is provided next and should be unpacked (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L561)
            freezeAuthority // Token's freeze authority account
        );
    }

    /// @notice Helper function to format a `initializeAccount2` instruction
    /// @param ata The associated token account to be initialized
    /// @param tokenMint The token mint account to which the new token account will be associated
    /// @param owner The account owning the new associated token account
    function formatInitializeAccount2Instruction(
        bytes32 ata,
        bytes32 tokenMint,
        bytes32 owner
    ) internal pure returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        accounts = new bytes32[](3);
        accounts[0] = ata;
        accounts[1] = tokenMint;
        accounts[2] = Constants.getSysvarRentPubkey();

        isSigner = new bool[](3);

        isWritable = new bool[](3);
        isWritable[0] = true;

        data = abi.encodePacked(
            bytes1(0x10), // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L545)
            owner
        );
    }

    /// @notice Helper function to format a `mintTo` instruction
    /// @param tokenMint The mint account of the token to be minted
    /// @param recipientATA The associated token account to which token will be minted
    /// @param amount The amount of token to be minted
    function formatMintToInstruction(
        bytes32 tokenMint,
        bytes32 recipientATA,
        uint64 amount
    ) internal view returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        accounts = new bytes32[](3);
        accounts[0] = tokenMint;
        accounts[1] = recipientATA;
        accounts[2] = LibSPLTokenData.getSPLTokenMintAuthority(tokenMint);

        isSigner = new bool[](3);
        isSigner[2] = true;

        isWritable = new bool[](3);
        isWritable[0] = true;
        isWritable[1] = true;

        // Get amount in right-padded little-endian format
        bytes32 amountLE = bytes32(SolanaDataConverterLib.readLittleEndianUnsigned256(uint256(amount)));
        data = abi.encodePacked(
            bytes1(0x07), // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L508)
            bytes8(amountLE) // Amount (right-padded little-endian)
        );
    }

    /// @notice Helper function to format a `transfer` instruction
    /// @param senderATA The sender's associated token account to be debited
    /// @param recipientATA The recipient's associated token account to be credited
    /// @param amount The amount of token to be transferred
    function formatTransferInstruction(
        bytes32 senderATA,
        bytes32 recipientATA,
        uint64 amount
    ) internal view returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        accounts = new bytes32[](3);
        accounts[0] = senderATA;
        accounts[1] = recipientATA;
        accounts[2] = LibSPLTokenData.getSPLTokenAccountOwner(senderATA);

        isSigner = new bool[](3);
        isSigner[2] = true;

        isWritable = new bool[](3);
        isWritable[0] = true;
        isWritable[1] = true;

        // Get amount in right-padded little-endian format
        bytes32 amountLE = bytes32(SolanaDataConverterLib.readLittleEndianUnsigned256(uint256(amount)));
        data = abi.encodePacked(
            bytes1(0x03), // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L506)
            bytes8(amountLE) // Amount (right-padded little-endian)
        );
    }

    /// @notice Helper function to format a `setAuthority` instruction in order to update a SPL token mint's mint or freeze
    /// authority or a a SPL token account's owner or close authority
    /// @param account The SPL token mint or account of which we want to update authority
    /// @param authorityType The type of authority to be updated
    /// @param newAuthority The new authority to be set
    function formatSetAuthorityInstruction(
        bytes32 account,
        AuthorityType authorityType,
        bytes32 newAuthority
    ) internal view returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        // Get the public key of the current authority to be revoked
        bytes32 currentAuthority;
        if (authorityType == AuthorityType.MINT) {
            currentAuthority = LibSPLTokenData.getSPLTokenMintAuthority(account);
        } else if (authorityType == AuthorityType.FREEZE) {
            currentAuthority = LibSPLTokenData.getSPLTokenFreezeAuthority(account);
        } else if (authorityType == AuthorityType.OWNER) {
            currentAuthority = LibSPLTokenData.getSPLTokenAccountOwner(account);
        } else if (authorityType == AuthorityType.CLOSE) {
            currentAuthority = LibSPLTokenData.getSPLTokenAccountCloseAuthority(account);
            if(currentAuthority == bytes32(0)) {
                currentAuthority = LibSPLTokenData.getSPLTokenAccountOwner(account);
            }
        }

        accounts = new bytes32[](2);
        accounts[0] = account;
        accounts[1] = currentAuthority;

        isSigner = new bool[](2);
        isSigner[1] = true;

        isWritable = new bool[](2);
        isWritable[0] = true;

        data = abi.encodePacked(
            bytes1(0x06), // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L514)
            authorityType, // Authority type (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L753)
            bytes1(0x01),
            newAuthority
        );
    }

    /// @notice Helper function to format an `approve` instruction in order to delegate some balance of an associated
    /// token account to a third party account
    /// @param ata The associated token account that we want to delegate
    /// @param delegate The account that we want to delegate to
    /// @param amount The amount of token that we want to delegate
    function formatApproveInstruction(
        bytes32 ata,
        bytes32 delegate,
        uint64 amount
    ) internal view returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        accounts = new bytes32[](3);
        accounts[0] = ata;
        accounts[1] = delegate;
        accounts[2] = LibSPLTokenData.getSPLTokenAccountOwner(ata);

        isSigner = new bool[](3);
        isSigner[2] = true;

        isWritable = new bool[](3);
        isWritable[0] = true;

        // Get amount in right-padded little-endian format
        bytes32 amountLE = bytes32(SolanaDataConverterLib.readLittleEndianUnsigned256(uint256(amount)));
        data = abi.encodePacked(
            bytes1(0x04), // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L507)
            bytes8(amountLE) // Amount (right-padded little-endian)
        );
    }

    /// @notice Helper function to format a `revoke` instruction in order to revoke all delegation granted by an
    // associated token account
    /// @param ata The associated token account for which we want to revoke all delegation
    function formatRevokeInstruction(
        bytes32 ata
    ) internal view returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        accounts = new bytes32[](2);
        accounts[0] = ata;
        accounts[1] = LibSPLTokenData.getSPLTokenAccountOwner(ata);

        isSigner = new bool[](2);
        isSigner[1] = true;

        isWritable = new bool[](2);
        isWritable[0] = true;

        data = hex'05'; // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L513)
    }

    /// @notice Helper function to format a `burn` instruction in order to burn tokens from a token account
    /// @param ata The associated token account which we want to burn tokens from
    /// @param tokenMint The token mint corresponding to the tokens we want to burn
    /// @param amount The amount of tokens we want to burn
    function formatBurnInstruction(
        bytes32 ata,
        bytes32 tokenMint,
        uint64 amount
    ) internal view returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        accounts = new bytes32[](3);
        accounts[0] = ata;
        accounts[1] = tokenMint;
        accounts[2] = LibSPLTokenData.getSPLTokenAccountOwner(ata);

        isSigner = new bool[](3);
        isSigner[2] = true;

        isWritable = new bool[](3);
        isWritable[0] = true;
        isWritable[1] = true;

        // Get amount in right-padded little-endian format
        bytes32 amountLE = bytes32(SolanaDataConverterLib.readLittleEndianUnsigned256(uint256(amount)));
        data = abi.encodePacked(
            bytes1(0x08), // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L509)
            bytes8(amountLE) // Amount (right-padded little-endian)
        );
    }

    /// @notice Helper function to format a `closeAccount` instruction in order to close an associated token account
    /// @param ata The associated token account that we want to close
    /// @param destination The account that will receive the closed ata's SOL balance
    function formatCloseAccountInstruction(
        bytes32 ata,
        bytes32 destination
    ) internal view returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        // Get the public key of the ata's CLOSE authority or OWNER
        bytes32 closeAuthority = LibSPLTokenData.getSPLTokenAccountCloseAuthority(ata);
        if(closeAuthority == bytes32(0)) {
            closeAuthority = LibSPLTokenData.getSPLTokenAccountOwner(ata);
        }

        accounts = new bytes32[](3);
        accounts[0] = ata;
        accounts[1] = destination;
        accounts[2] = closeAuthority;

        isSigner = new bool[](3);
        isSigner[2] = true;

        isWritable = new bool[](3);
        isWritable[0] = true;
        isWritable[1] = true;

        data = hex'09'; // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L526)
    }

    /// @notice Helper function to format a `syncNative` instruction in order to sync a Wrapped SOL token account's
    // balance
    /// @param tokenAccount The Wrapped SOL token account that we want to sync
    function formatSyncNativeInstruction(bytes32 tokenAccount) internal pure returns (
        bytes32[] memory accounts,
        bool[] memory isSigner,
        bool[] memory isWritable,
        bytes memory data
    ) {
        accounts = new bytes32[](1);
        accounts[0] = tokenAccount;

        isSigner = new bool[](1);

        isWritable = new bool[](1);
        isWritable[0] = true;

        data = hex'11'; // Instruction variant (see: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/instruction.rs#L549)
    }
}
