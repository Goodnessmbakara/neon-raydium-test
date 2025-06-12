// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { CallSolanaHelperLib } from '../utils/CallSolanaHelperLib.sol';
import { Constants } from "./libraries/Constants.sol";
import { LibSPLTokenProgram } from "./libraries/spl-token-program/LibSPLTokenProgram.sol";
import { LibSystemData } from "./libraries/system-program/LibSystemData.sol";
import { LibAssociatedTokenData } from "./libraries/associated-token-program/LibAssociatedTokenData.sol";
import { LibAssociatedTokenProgram } from "./libraries/associated-token-program/LibAssociatedTokenProgram.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { ICallSolana } from '../precompiles/ICallSolana.sol';

/// @title CallAssociatedTokenProgram
/// @notice Example contract showing how to use LibAssociatedTokenProgram and LibAssociatedTokenData libraries to
/// interact with Solana's Associated Token program
/// @author maxpolizzo@gmail.com
contract CallAssociatedTokenProgram is Ownable2Step {
    ICallSolana public constant CALL_SOLANA = ICallSolana(0xFF00000000000000000000000000000000000006);

    constructor() Ownable(msg.sender) {} // msg.sender is granted authority to transfer tokens from contract's ATA

    /// @notice This function creates and initializes a canonical Associated Token account
    /// Associated Token accounts are token accounts which are derived in a canonical way from a token mint account
    /// public key and a Solana account public key. In other words, canonical associated token accounts are arbitrary
    /// token accounts that are derived in a specific way. Given a Solana user's public key and a token mint account
    /// public key, anyone can derive the corresponding Solana user's ATA, create and initialize it and transfer tokens
    /// to it. This is the approach followed by most dApps on Solana when they have to transfer SPL tokens to their
    /// users.
    /// This function can be used to create and initialize a canonical Associated Token account for any third party
    /// Solana user. It cna also be used to  create and initialize a canonical Associated Token account owned by this
    /// contract.
    function createInitializeAssociatedTokenAccount(bytes32 tokenMint, bytes32 owner) external {
        /// @dev If the ATA is to be owned by this contract the `owner` field should be left empty.
        /// @dev If the ATA is to be used by a third party `solanaUser` Solana account to send tokens directly on Solana
        /// without interacting with this contract, the `owner` field should be the `solanaUser` account.
        if (owner == bytes32(0)) {
            // If owner is empty, associated token account owner is this contract
            owner =  CALL_SOLANA.getNeonAddress(address(this));
        }
        // Get the payer account which will pay to fund the ata creation
        bytes32 payer = CALL_SOLANA.getPayer();
        // Format create instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data,
            uint64 rentExemptionBalance
        ) = LibAssociatedTokenProgram.formatCreateInstruction(
            payer,
            owner, // account which owns the ATA and can spend from it
            tokenMint
        );
        // Prepare initializeAccount2 instruction
        bytes memory createIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getAssociatedTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute initializeAccount2 instruction
        // Neon proxy operator is asked to send the SOL amount equal to rentExemptionBalance with the transaction in
        // order to fund the created account
        CALL_SOLANA.execute(rentExemptionBalance, createIx);
    }

    /// @notice This function shows how this contract can transfer tokens from its own associated token account created
    /// via the createInitializeAssociatedTokenAccount function
    function transfer(
        bytes32 tokenMint,
        bytes32 recipientATA,
        uint64 amount
    ) external onlyOwner {
        bytes32 thisContractPubKey = CALL_SOLANA.getNeonAddress(address(this));
        // Get the associated token account owned by this contract
        bytes32 ata = LibAssociatedTokenData.getAssociatedTokenAccount(
            tokenMint,
            thisContractPubKey
        );
        // Format transfer instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatTransferInstruction(
            ata,
            recipientATA,
            amount
        );
        // Prepare transfer instruction
        bytes memory transferIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute transfer instruction
        CALL_SOLANA.execute(0, transferIx);
    }

    // Returns Solana public key for NeonEVM address
    function getNeonAddress(address user) external view returns (bytes32) {
        return CALL_SOLANA.getNeonAddress(user);
    }

    // Associated Token account data getters

    /// @notice Function to get the 32 bytes canonical associated token account public key derived from a token mint
    /// account public key and a user public key
    /// @param tokenMint The 32 bytes public key of the token mint associated with the token account we want to get
    /// @param ownerPubKey The 32 bytes public key of the owner of the associated token account
    /// @return the 32 bytes token account public key derived from the token mint account public key and the user public
    /// key
    function getAssociatedTokenAccount(
        bytes32 tokenMint,
        bytes32 ownerPubKey
    ) public view returns(bytes32) {
        return LibAssociatedTokenData.getAssociatedTokenAccount(tokenMint, ownerPubKey);
    }
}
