// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { CallSolanaHelperLib } from '../utils/CallSolanaHelperLib.sol';
import { Constants } from "./libraries/Constants.sol";
import { LibAssociatedTokenData } from "./libraries/associated-token-program/LibAssociatedTokenData.sol";
import { LibSystemData } from "./libraries/system-program/LibSystemData.sol";
import { LibSPLTokenData } from "./libraries/spl-token-program/LibSPLTokenData.sol";
import { LibSPLTokenErrors } from "./libraries/spl-token-program/LibSPLTokenErrors.sol";
import { LibSPLTokenProgram } from "./libraries/spl-token-program/LibSPLTokenProgram.sol";

import { ICallSolana } from '../precompiles/ICallSolana.sol';

import { CallMetaplexProgram } from './CallMetaplexProgram.sol';

/// @title CallSPLTokenProgram
/// @notice Example contract showing how to use LibSPLTokenProgram and LibSPLTokenData libraries to interact with
/// Solana's SPL Token program
/// @author maxpolizzo@gmail.com
contract CallSPLTokenProgram is CallMetaplexProgram {

    function createInitializeTokenMint(bytes memory seed, uint8 decimals) external {
        // Create SPL token mint account: msg.sender and a seed are used to calculate the salt used to derive the token
        // mint account, allowing for future authentication when interacting with this token mint. Note that it is
        // entirely possible to calculate the salt in a different manner and to use a different approach for
        // authentication
        bytes32 tokenMint = CALL_SOLANA.createResource(
            sha256(abi.encodePacked(
                msg.sender, // msg.sender is included here for future authentication
                seed // using different seeds allows msg.sender to create different token mint accounts
            )), // salt
            LibSPLTokenData.SPL_TOKEN_MINT_SIZE, // space
            LibSystemData.getRentExemptionBalance(
                LibSPLTokenData.SPL_TOKEN_MINT_SIZE,
                LibSystemData.getSystemAccountData(
                    Constants.getSysvarRentPubkey(),
                    LibSystemData.getSpace(Constants.getSysvarRentPubkey())
                )
            ), // lamports
            Constants.getTokenProgramId() // Owner must be SPL Token program
        );

        // This contract is mint/freeze authority
        bytes32 authority = CALL_SOLANA.getNeonAddress(address(this));
        // Format initializeMint2 instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatInitializeMint2Instruction(
            decimals,
            tokenMint,
            authority,
            authority
        );

        // Prepare initializeMint2 instruction
        bytes memory initializeMint2Ix = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );

        // Execute initializeMint2 instruction
        CALL_SOLANA.execute(0, initializeMint2Ix);
    }

    /// @notice This function creates and initializes an arbitrary SPL Token account. Arbitrary SPL Token accounts
    /// differ from canonical Associated Token accounts in that they are derived in an arbitrary way (using an arbitrary
    /// nonce) and it is possible to derive many different Arbitrary SPL Token accounts for the same user and token mint
    /// by using different arbitrary nonce values.
    /// Using Arbitrary SPL Token accounts in the context of this contract deployed on NeonEVM allows for cheap and easy
    /// authentication of NeonEVM users to let them interact with and effectively control those token accounts securely
    /// via this contract while this contract is the actual owner of those token accounts on Solana.
    /// Using this function it is possible to create and initialize an arbitrary SPL Token account to be controlled by a
    /// NeonEVM user (who could be msg.sender or a third party NeonEVM user). In this case, only that NeonEVM user is
    /// allowed to perform state changes to the created token account via this contract.
    /// It is also possible to create and initialize an arbitrary SPL Token account for a third party Solana user who
    /// will have full ownership of the created token account on Solana (and won't be able to control the token accounts
    /// via this contract)
    function createInitializeArbitraryTokenAccount(bytes32 tokenMint, bytes32 owner, bytes32 tokenOwner) external {
        /// @dev If the token account is to be used by `msg.sender` to send tokens through this contract the `owner`
        /// field should be left empty.
        /// @dev If the token account is to be used by a third party `user` NeonEVM account to send tokens through this
        /// contract the `owner` field should be `CALL_SOLANA.getNeonAddress(user)` and the `tokenOwner` field should be
        /// left empty.
        /// @dev If the token account is to be used by a third party `solanaUser` Solana account to send tokens directly
        /// on Solana without interacting with this contract, both the `owner` field and the `tokenOwner` field should
        /// be the `solanaUser` account.
        if (owner == bytes32(0)) {
            // If owner is empty, account owner is derived from msg.sender
            owner =  CALL_SOLANA.getNeonAddress(msg.sender);
            // If owner is empty, token owner is this contract
            tokenOwner = CALL_SOLANA.getNeonAddress(address(this));
        } else if (tokenOwner == bytes32(0)) {
            // If tokenOwner is empty, token owner is this contract
            tokenOwner = CALL_SOLANA.getNeonAddress(address(this));
        }
        // Create SPL arbitrary token account: the owner account is used to derive the token account, allowing for
        // future authentication when interacting with this token account
        bytes32 tokenAccount = CALL_SOLANA.createResource(
            sha256(abi.encodePacked(
                owner,
                Constants.getTokenProgramId(),
                tokenMint,
                uint8(0), // Here we use nonce == 0 by default, however nonce can be incremented te create different
                // token accounts for the same owner
                Constants.getAssociatedTokenProgramId()
            )), // salt
            LibSPLTokenData.SPL_TOKEN_ACCOUNT_SIZE, // space
            LibSystemData.getRentExemptionBalance(
                LibSPLTokenData.SPL_TOKEN_ACCOUNT_SIZE,
                LibSystemData.getSystemAccountData(
                    Constants.getSysvarRentPubkey(),
                    LibSystemData.getSpace(Constants.getSysvarRentPubkey())
                )
            ), // lamports
            Constants.getTokenProgramId() // Owner must be SPL Token program
        );
        // Format initializeAccount2 instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatInitializeAccount2Instruction(
            tokenAccount,
            tokenMint,
            tokenOwner  // account which owns the token account and can spend from it
        );
        // Prepare initializeAccount2 instruction
        bytes memory initializeAccount2Ix = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute initializeAccount2 instruction
        CALL_SOLANA.execute(0, initializeAccount2Ix);
    }

    function mint(
        bytes memory seed,
        bytes32 recipientATA,
        uint64 amount
    ) external {
        // Authentication: we derive the token mint account from msg.sender and seed
        bytes32 tokenMint = getTokenMintAccount(msg.sender, seed);
        // Format mintTo instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatMintToInstruction(
            tokenMint,
            recipientATA,
            amount
        );
        // Prepare mintTo instruction
        bytes memory mintToIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute mintTo instruction
        CALL_SOLANA.execute(0, mintToIx);
    }

    function transfer(
        bytes32 tokenMint,
        bytes32 recipientATA,
        uint64 amount
    ) external {
        // Authentication: sender's Solana account is derived from msg.sender
        bytes32 senderPubKey = CALL_SOLANA.getNeonAddress(msg.sender);
        // Authentication: we derive the sender's associated token account from the sender account and the token mint account
        bytes32 senderATA = getArbitraryTokenAccount(tokenMint, senderPubKey, 0);
        // Format transfer instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatTransferInstruction(
            senderATA,
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

    function claim(
        bytes32 senderATA,
        bytes32 recipientATA,
        uint64 amount
    ) external {
        // Authentication: spender's Solana account is derived from msg.sender
        bytes32 spenderPubKey = CALL_SOLANA.getNeonAddress(msg.sender);
        // Authentication: we verify that the sender token account has been delegated to the spender account and that
        // delegated amount is larger than or equal to claimed amount
        bytes32 senderATADelegate = getSPLTokenAccountDelegate(senderATA);
        require(
            senderATADelegate == spenderPubKey,
            LibSPLTokenErrors.InvalidSpender(
                senderATA,
                senderATADelegate,
                spenderPubKey
            )
        );
        uint64 senderATADelegatedAmount = getSPLTokenAccountDelegatedAmount(senderATA);
        require(
            senderATADelegatedAmount >= amount,
            LibSPLTokenErrors.InsufficientDelegatedAmount(
                senderATA,
                senderATADelegatedAmount,
                amount
            )
        );
        // Format transfer instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatTransferInstruction(
            senderATA,
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

    function updateTokenMintAuthority(
        bytes memory seed, // Seed that was used to create the token mint of which we want to update authority
        LibSPLTokenProgram.AuthorityType authorityType, // MINT or FREEZE authority
        bytes32 newAuthority
    ) external {
        // Authentication: we derive the token mint account from msg.sender and seed
        bytes32 tokenMint = getTokenMintAccount(msg.sender, seed);
        // Check current authority
        bytes32 thisContractPubKey = CALL_SOLANA.getNeonAddress(address(this));
        if (authorityType == LibSPLTokenProgram.AuthorityType.MINT) {
            // Check that this contract is the current token mint's MINT authority (only token mint's MINT authority can
            // update token mint's MINT authority)
            // See: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/processor.rs#L486
            bytes32 mintAuthority = LibSPLTokenData.getSPLTokenMintAuthority(tokenMint);
            require(
                thisContractPubKey == mintAuthority,
                LibSPLTokenErrors.InvalidMintAuthority(
                    tokenMint,
                    mintAuthority,
                    thisContractPubKey
                )
            );
        } else if (authorityType == LibSPLTokenProgram.AuthorityType.FREEZE) {
            // Check that this contract is the current token mint's FREEZE authority (only token mint's FREEZE authority
            // can update token mint's FREEZE authority)
            // See: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/processor.rs#L500
            bytes32 freezeAuthority = LibSPLTokenData.getSPLTokenFreezeAuthority(tokenMint);
            require(
                thisContractPubKey == freezeAuthority,
                LibSPLTokenErrors.InvalidFreezeAuthority(
                    tokenMint,
                    freezeAuthority,
                    thisContractPubKey
                )
            );
        } else {
            revert LibSPLTokenErrors.InvalidTokenMintAuthorityType(tokenMint);
        }
        // Format setAuthority instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatSetAuthorityInstruction(
            tokenMint, // account of which we want to update authority
            authorityType,
            newAuthority
        );
        // Prepare setAuthority instruction
        bytes memory setAuthorityIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute setAuthority instruction
        CALL_SOLANA.execute(0, setAuthorityIx);
    }

    function updateTokenAccountAuthority(
        bytes32 tokenMint, // SPL token mint associated with the SPL token account of which we want to update authority
        LibSPLTokenProgram.AuthorityType authorityType, // OWNER or CLOSE authority
        bytes32 newAuthority
    ) external {
        // Authentication: user's Solana account is derived from msg.sender
        bytes32 userPubKey = CALL_SOLANA.getNeonAddress(msg.sender);
        // Authentication: we derive the user's associated token account from the user account and the token mint account
        bytes32 userATA = getArbitraryTokenAccount(tokenMint, userPubKey, 0);
        // Check current authority
        bytes32 thisContractPubKey = CALL_SOLANA.getNeonAddress(address(this));
        if (authorityType == LibSPLTokenProgram.AuthorityType.OWNER) {
            // Check that this contract is the current token account OWNER (only token account OWNER can update token
            // account OWNER)
            // See: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/processor.rs#L446
            bytes32 tokenAccountOwner = LibSPLTokenData.getSPLTokenAccountOwner(userATA);
            require(
                thisContractPubKey == tokenAccountOwner,
                LibSPLTokenErrors.InvalidOwnerAuthority(
                    userATA,
                    tokenAccountOwner,
                    thisContractPubKey
                )
            );
        } else if (authorityType == LibSPLTokenProgram.AuthorityType.CLOSE) {
            // Check that this contract is the current token account OWNER or the current token account's CLOSE authority
            // (only token account OWNER or CLOSE authority can update token account's CLOSE authority)
            // See: https://github.com/solana-program/token/blob/08aa3ccecb30692bca18d6f927804337de82d5ff/program/src/processor.rs#L465
            bytes32 tokenAccountOwner = LibSPLTokenData.getSPLTokenAccountOwner(userATA);
            if (thisContractPubKey != tokenAccountOwner) {
                bytes32 tokenAccountCloseAuthority = LibSPLTokenData.getSPLTokenAccountCloseAuthority(userATA);
                require(
                    thisContractPubKey == tokenAccountCloseAuthority,
                    LibSPLTokenErrors.InvalidCloseAuthority(
                        userATA,
                        tokenAccountOwner,
                        tokenAccountCloseAuthority,
                        thisContractPubKey
                    )
                );
            }
        } else {
            revert LibSPLTokenErrors.InvalidTokenAccountAuthorityType(userATA);
        }
        // Format setAuthority instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatSetAuthorityInstruction(
            userATA, // account of which we want to update authority
            authorityType,
            newAuthority
        );
        // Prepare setAuthority instruction
        bytes memory setAuthorityIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute setAuthority instruction
        CALL_SOLANA.execute(0, setAuthorityIx);
    }

    function approve(bytes32 tokenMint, bytes32 delegate, uint64 amount) external {
        // Authentication: user's Solana account is derived from msg.sender
        bytes32 userPubKey = CALL_SOLANA.getNeonAddress(msg.sender);
        // Authentication: we derive the user's associated token account from the user account and the token mint account
        bytes32 userATA = getArbitraryTokenAccount(tokenMint, userPubKey, 0);
        // Format approve instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatApproveInstruction(
            userATA,
            delegate,
            amount
        );
        // Prepare approve instruction
        bytes memory approveIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute approve instruction
        CALL_SOLANA.execute(0, approveIx);
    }

    function revokeApproval(bytes32 tokenMint) external {
        // Authentication: user's Solana account is derived from msg.sender
        bytes32 userPubKey = CALL_SOLANA.getNeonAddress(msg.sender);
        // Authentication: we derive the user's associated token account from the user account and the token mint account
        bytes32 userATA = getArbitraryTokenAccount(tokenMint, userPubKey, 0);
        // Format revoke instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatRevokeInstruction(
            userATA
        );
        // Prepare revoke instruction
        bytes memory revokeIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute revoke instruction
        CALL_SOLANA.execute(0, revokeIx);
    }

    function burn(bytes32 tokenMint, uint64 amount) external {
        // Authentication: user's Solana account is derived from msg.sender
        bytes32 userPubKey = CALL_SOLANA.getNeonAddress(msg.sender);
        // Authentication: we derive the user's associated token account from the user account and the token mint account
        bytes32 userATA = getArbitraryTokenAccount(tokenMint, userPubKey, 0);
        // Format burn instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatBurnInstruction(
            userATA,
            tokenMint,
            amount
        );
        // Prepare burn instruction
        bytes memory burnIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute approve instruction
        CALL_SOLANA.execute(0, burnIx);
    }

    function closeTokenAccount(bytes32 tokenMint, bytes32 destination) external {
        // Authentication: user's Solana account is derived from msg.sender
        bytes32 userPubKey = CALL_SOLANA.getNeonAddress(msg.sender);
        // Authentication: we derive the user's associated token account from the user account and the token mint account
        bytes32 userATA = getArbitraryTokenAccount(tokenMint, userPubKey, 0);
        // Format closeAccount instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatCloseAccountInstruction(
            userATA,
            destination // The account which will receive the closed token account's SOL balance
        );
        // Prepare approve instruction
        bytes memory approveIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute approve instruction
        CALL_SOLANA.execute(0, approveIx);
    }

    /// @notice Function to execute a `syncNative` instruction in order to sync a Wrapped SOL token account's
    // balance
    /// @param tokenAccount The Wrapped SOL token account that we want to sync
    function syncWrappedSOLAccount(bytes32 tokenAccount) external {
        // No authentication: anyone can sync any Wrapped SOL token account
        // Format syncNative instruction
        (   bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibSPLTokenProgram.formatSyncNativeInstruction(
            tokenAccount
        );
        // Prepare syncNative instruction
        bytes memory syncNativeIx = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getTokenProgramId(),
            accounts,
            isSigner,
            isWritable,
            data
        );
        // Execute syncNative instruction
        CALL_SOLANA.execute(0, syncNativeIx);
    }

    // Returns Solana public key for NeonEVM address
    function getNeonAddress(address user) external view override returns (bytes32) {
        return CALL_SOLANA.getNeonAddress(user);
    }

    // SPL Token mint data getters

    function getTokenMintAccount(address owner, bytes memory seed) public view override returns(bytes32) {
        // Returns the token mint account derived from from msg.sender and seed
        return CALL_SOLANA.getResourceAddress(sha256(abi.encodePacked(
            owner, // account that created and owns the token mint
            seed // Seed that has been used to create token mint
        )));
    }

    /// @param tokenMint The 32 bytes SPL token mint account public key
    /// @return true if the token mint is initialized, false otherwise
    function getSPLTokenMintIsInitialized(bytes32 tokenMint) external view returns(bool) {
        return LibSPLTokenData.getSPLTokenMintIsInitialized(tokenMint);
    }

    /// @param tokenMint The 32 bytes SPL token mint account public key
    /// @return token supply as uint64
    function getSPLTokenSupply(bytes32 tokenMint) external view returns(uint64) {
        return LibSPLTokenData.getSPLTokenSupply(tokenMint);
    }

    /// @param tokenMint The 32 bytes SPL token mint account public key
    /// @return token decimals as uint8
    function getSPLTokenDecimals(bytes32 tokenMint) external view returns(uint8) {
        return LibSPLTokenData.getSPLTokenDecimals(tokenMint);
    }

    /// @param tokenMint The 32 bytes SPL token mint account public key
    /// @return 32 bytes public key of the token's MINT authority
    function getSPLTokenMintAuthority(bytes32 tokenMint) external view returns(bytes32) {
        return LibSPLTokenData.getSPLTokenMintAuthority(tokenMint);
    }

    /// @param tokenMint The 32 bytes SPL token mint account public key
    /// @return 32 bytes public key of the token's FREEZE authority
    function getSPLTokenFreezeAuthority(bytes32 tokenMint) external view returns(bytes32) {
        return LibSPLTokenData.getSPLTokenFreezeAuthority(tokenMint);
    }

    /// @param tokenMint The 32 bytes SPL token mint account public key
    /// @return the full token mint data formatted as a SPLTokenMintData struct
    function getSPLTokenMintData(bytes32 tokenMint) external view returns(LibSPLTokenData.SPLTokenMintData memory) {
        return LibSPLTokenData.getSPLTokenMintData(tokenMint);
    }

    // SPL Token account data getters

    /// @notice Function to get the 32 bytes canonical associated token account public key derived from a token mint
    /// account public key and a user public key
    /// @param tokenMint The 32 bytes public key of the token mint associated with the token account we want to get
    /// @param ownerPubKey The 32 bytes public key of the owner of the associated token account
    /// @return the 32 bytes token account public key derived from the token mint account public key, the user public
    /// key and a nonce value of 0
    function getAssociatedTokenAccount(
        bytes32 tokenMint,
        bytes32 ownerPubKey
    ) public view returns(bytes32) {
        return LibAssociatedTokenData.getAssociatedTokenAccount(tokenMint, ownerPubKey);
    }

    /// @notice Function to get an arbitrary 32 bytes token account public key derived from a token mint account public
    /// key, a user public key and an arbitrary nonce
    /// @param tokenMint The 32 bytes public key of the token mint associated with the token account we want to get
    /// @param ownerPubKey The 32 bytes public key of the owner of the arbitrary token account
    /// @param nonce A uint8 nonce (can be incremented to get different token accounts)
    /// @return the 32 bytes token account public key derived from the token mint account public key, the user public
    /// key and the nonce
    function getArbitraryTokenAccount(
        bytes32 tokenMint,
        bytes32 ownerPubKey,
        uint8 nonce
    ) public view returns(bytes32) {
        return LibSPLTokenData.getArbitraryTokenAccount(tokenMint, ownerPubKey, nonce);
    }

    /// @param tokenAccount The 32 bytes SPL token account public key
    /// @return true if the token account is initialized, false otherwise
    function getSPLTokenAccountIsInitialized(bytes32 tokenAccount) external view returns(bool) {
        return LibSPLTokenData.getSPLTokenAccountIsInitialized(tokenAccount);
    }

    /// @param tokenAccount The 32 bytes SPL token account public key
    /// @return true if the token account is a Wrapped SOL token account, false otherwise
    function getSPLTokenAccountIsNative(bytes32 tokenAccount) external view returns(bool) {
        return LibSPLTokenData.getSPLTokenAccountIsNative(tokenAccount);
    }

    /// @param tokenAccount The 32 bytes SPL token account public key
    /// @return token account balance as uint64
    function getSPLTokenAccountBalance(bytes32 tokenAccount) external view returns(uint64) {
        return LibSPLTokenData.getSPLTokenAccountBalance(tokenAccount);
    }

    /// @param tokenAccount The 32 bytes SPL token account public key
    /// @return 32 bytes public key of the token account owner
    function getSPLTokenAccountOwner(bytes32 tokenAccount) external view returns(bytes32) {
        return LibSPLTokenData.getSPLTokenAccountOwner(tokenAccount);
    }

    /// @param tokenAccount The 32 bytes SPL token account public key
    /// @return 32 bytes public key of the token mint account associated with the token account
    function getSPLTokenAccountMint(bytes32 tokenAccount) external view returns(bytes32) {
        return LibSPLTokenData.getSPLTokenAccountMint(tokenAccount);
    }

    /// @param tokenAccount The 32 bytes SPL token account public key
    /// @return 32 bytes public key of the token account's delegate
    function getSPLTokenAccountDelegate(bytes32 tokenAccount) public view returns(bytes32) {
        return LibSPLTokenData.getSPLTokenAccountDelegate(tokenAccount);
    }

    /// @param tokenAccount The 32 bytes SPL token account public key
    /// @return the token account's delegated amount as uint64
    function getSPLTokenAccountDelegatedAmount(bytes32 tokenAccount) public view returns(uint64) {
        return LibSPLTokenData.getSPLTokenAccountDelegatedAmount(tokenAccount);
    }

    /// @param tokenAccount The 32 bytes SPL token account public key
    /// @return 32 bytes public key of the token account's CLOSE authority
    function getSPLTokenAccountCloseAuthority(bytes32 tokenAccount) external view returns(bytes32) {
        return LibSPLTokenData.getSPLTokenAccountCloseAuthority(tokenAccount);
    }

    /// @param tokenAccount The 32 bytes SPL token account public key
    /// @return the full token account data formatted as a SPLTokenAccountData struct
    function getSPLTokenAccountData(bytes32 tokenAccount) external view returns(LibSPLTokenData.SPLTokenAccountData memory) {
        return LibSPLTokenData.getSPLTokenAccountData(tokenAccount);
    }
}
