// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { CallSolanaHelperLib } from '../utils/CallSolanaHelperLib.sol';
import { Constants } from "./libraries/Constants.sol";
import { LibSystemData } from "./libraries/system-program/LibSystemData.sol";
import { LibSystemProgram } from "./libraries/system-program/LibSystemProgram.sol";

import { ICallSolana } from '../precompiles/ICallSolana.sol';

/// @title CallSystemProgram
/// @notice Example contract showing how to use LibSystemProgram and LibSystemData libraries to interact with Solana's
/// System program
/// @author maxpolizzo@gmail.com
contract CallSystemProgram {
    ICallSolana public constant CALL_SOLANA = ICallSolana(0xFF00000000000000000000000000000000000006);

    function createAccountWithSeed(
        bytes32 programId,
        bytes memory seed,
        uint64 accountSize
    ) external {
        bytes32 payer = CALL_SOLANA.getPayer();
        bytes32 basePubKey = CALL_SOLANA.getNeonAddress(address(this));

        // Format createAccountWithSeed instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data,
            uint64 rentExemptionBalance
        ) = LibSystemProgram.formatCreateAccountWithSeedInstruction(
            payer,
            basePubKey,
            programId,
            seed,
            accountSize
        );
        // Prepare createAccountWithSeed instruction
        bytes memory createAccountWithSeedIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getSystemProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute createAccountWithSeed instruction
        // Neon proxy operator is asked to send the SOL amount equal to rentExemptionBalance with the transaction in
        // order to fund the created account
        CALL_SOLANA.execute(rentExemptionBalance, createAccountWithSeedIx);
    }

    function transfer(
        bytes32 recipient,
        uint64 amount
    ) external {
        // Payer account will pay the SOL amount while msg.sender will pay gas fees covering that amount plus
        // transaction fees
        bytes32 payer = CALL_SOLANA.getPayer();

        // Format transfer instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSystemProgram.formatTransferInstruction(
            payer,
            recipient,
            amount
        );
        // Prepare transfer instruction
        bytes memory transferIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getSystemProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute transfer instruction, sending amount lamports
        CALL_SOLANA.execute(amount, transferIx);
    }

    function assign(
        bytes32 programId,
        bytes memory seed
    ) external {
        bytes32 basePubKey = CALL_SOLANA.getNeonAddress(address(this));

        // Format assignWithSeed instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSystemProgram.formatAssignWithSeedInstruction(
            basePubKey,
            programId,
            seed
        );
        // Prepare assignWithSeed instruction
        bytes memory assignWithSeedIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getSystemProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute assignWithSeed instruction
        CALL_SOLANA.execute(0, assignWithSeedIx);
    }

    function allocate(
        bytes32 programId,
        bytes memory seed,
        uint64 accountSize
    ) external {
        bytes32 basePubKey = CALL_SOLANA.getNeonAddress(address(this));

        // Format allocateWithSeed instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSystemProgram.formatAllocateWithSeedInstruction(
            basePubKey,
            programId,
            seed,
            accountSize
        );
        // Prepare allocateWithSeed instruction
        bytes memory allocateWithSeedIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getSystemProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute allocateWithSeed instruction
        CALL_SOLANA.execute(0, allocateWithSeedIx);
    }

    // Returns the account public key derived from the provided basePubKey, programId and seed
    function getCreateWithSeedAccount(
        bytes32 basePubKey,
        bytes32 programId,
        bytes memory seed
    ) public pure returns(bytes32) {
        return LibSystemData.getCreateWithSeedAccount(basePubKey, programId, seed);
    }

    // Returns Solana public key for NeonEVM address
    function getNeonAddress(address user) external view returns (bytes32) {
        return CALL_SOLANA.getNeonAddress(user);
    }

    // System account data getters

    /// @param accountPubKey The 32 bytes Solana account public key
    /// @return lamport balance of the account as uint64
    function getBalance(bytes32 accountPubKey) external view returns(uint64) {
        return LibSystemData.getBalance(accountPubKey);
    }

    /// @param accountPubKey The 32 bytes Solana account public key
    /// @return The 32 bytes public key of the account's owner
    function getOwner(bytes32 accountPubKey) external view returns(bytes32) {
        return LibSystemData.getOwner(accountPubKey);
    }

    /// @param accountPubKey The 32 bytes Solana account public key
    /// @return true if the token mint is a program account, false otherwise
    function getIsExecutable(bytes32 accountPubKey) external view returns(bool) {
        return LibSystemData.getIsExecutable(accountPubKey);

    }

    /// @param accountPubKey The 32 bytes Solana account public key
    /// @return account's rent epoch as uint64
    function getRentEpoch(bytes32 accountPubKey) external view returns(uint64) {
        return LibSystemData.getRentEpoch(accountPubKey);
    }

    /// @param accountPubKey The 32 bytes Solana account public key
    /// @return account's allocated storage space in bytes as uint64
    function getSpace(bytes32 accountPubKey) external view returns(uint64) {
        return LibSystemData.getSpace(accountPubKey);
    }

    /// @param accountPubKey The 32 bytes Solana account public key
    /// @param size The uint8 bytes size of the data we want to get
    /// @return the account data bytes
    function getSystemAccountData(bytes32 accountPubKey, uint8 size) external view returns(bytes memory) {
        return LibSystemData.getSystemAccountData(accountPubKey, size);
    }

    /// @param accountBytesSize The storage space allocated to considered Solana account in bytes
    /// @return account's minimum balance for rent exemption
    function getRentExemptionBalance(uint64 accountBytesSize) external view returns(uint64) {
        // Get the latest rent data from Solana's SysvarRent111111111111111111111111111111111 account
        bytes memory rentDataBytes = LibSystemData.getSystemAccountData(
            Constants.getSysvarRentPubkey(),
            LibSystemData.getSpace(Constants.getSysvarRentPubkey())
        );

        return LibSystemData.getRentExemptionBalance(accountBytesSize, rentDataBytes);
    }

    /// @param accountPubKey The 32 bytes Solana account public key
    /// @return true if account is rent exempt, false otherwise
    function isRentExempt(bytes32 accountPubKey) external view returns(bool) {
        return LibSystemData.isRentExempt(accountPubKey);
    }
}
