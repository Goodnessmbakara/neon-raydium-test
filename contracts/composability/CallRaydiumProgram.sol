// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Constants} from "./libraries/Constants.sol";
import {CallSolanaHelperLib} from "../utils/CallSolanaHelperLib.sol";
import {ICallSolana} from "../precompiles/ICallSolana.sol";
import {LibAssociatedTokenData} from "./libraries/associated-token-program/LibAssociatedTokenData.sol";
import {LibRaydiumProgram} from "./libraries/raydium-program/LibRaydiumProgram.sol";
import {LibRaydiumData} from "./libraries/raydium-program/LibRaydiumData.sol";
import {LibSPLTokenData} from "./libraries/spl-token-program/LibSPLTokenData.sol";
import {LibSPLTokenProgram} from "./libraries/spl-token-program/LibSPLTokenProgram.sol";
import {SolanaDataConverterLib} from "../utils/SolanaDataConverterLib.sol";


interface IERC20ForSpl {
    function transferSolana(bytes32 to, uint64 amount) external returns(bool);
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external;
    function tokenMint() external view returns(bytes32);
}


/// @title CallRaydiumProgram
/// @author https://twitter.com/mnedelchev_
/// @notice Example contract showing how to use LibRaydium library to interact with the Raydium program on Solana
contract CallRaydiumProgram {
    using SolanaDataConverterLib for uint64;
    ICallSolana public constant CALL_SOLANA = ICallSolana(0xFF00000000000000000000000000000000000006);

    error InvalidTokens();

    function createPool(
        address tokenA,
        address tokenB,
        uint64 mintAAmount,
        uint64 mintBAmount,
        uint64 startTime
    ) public returns(bytes32) {
        bytes32 tokenAMint = IERC20ForSpl(tokenA).tokenMint();
        bytes32 tokenBMint = IERC20ForSpl(tokenB).tokenMint();
        bytes32 payerAccount = CALL_SOLANA.getPayer();
        bytes32 tokenA_ATA = LibAssociatedTokenData.getAssociatedTokenAccount(tokenAMint, payerAccount);
        bytes32 tokenB_ATA = LibAssociatedTokenData.getAssociatedTokenAccount(tokenBMint, payerAccount);

        IERC20ForSpl(tokenA).transferFrom(msg.sender, address(this), mintAAmount);
        IERC20ForSpl(tokenA).transferSolana(
            tokenA_ATA,
            mintAAmount
        );

        IERC20ForSpl(tokenB).transferFrom(msg.sender, address(this), mintBAmount);
        IERC20ForSpl(tokenB).transferSolana(
            tokenB_ATA,
            mintBAmount
        );

        bytes32[] memory premadeAccounts = new bytes32[](20);
        premadeAccounts[0] = payerAccount;
        premadeAccounts[7] = tokenA_ATA;
        premadeAccounts[8] = tokenB_ATA;

        (
            uint64 lamports,
            bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibRaydiumProgram.createPoolInstruction(tokenAMint, tokenBMint, mintAAmount, mintBAmount, startTime, 0, true, premadeAccounts);

        CALL_SOLANA.execute(
            lamports,
            CallSolanaHelperLib.prepareSolanaInstruction(
                Constants.getCreateCPMMPoolProgramId(),
                accounts,
                isSigner,
                isWritable,
                data
            )
        );

        return accounts[3]; // poolId
    }

    function addLiquidity(
        bytes32 poolId,
        address tokenA,
        address tokenB,
        uint64 amountTokenA,
        uint64 amountTokenB,
        uint64 inputAmount,
        bool baseIn,
        uint16 slippage
    ) public {
        bytes32 tokenAMint = IERC20ForSpl(tokenA).tokenMint();
        bytes32 tokenBMint = IERC20ForSpl(tokenB).tokenMint();
        bytes32 payerAccount = CALL_SOLANA.getPayer();
        bytes32 tokenA_ATA = LibAssociatedTokenData.getAssociatedTokenAccount(tokenAMint, payerAccount);
        bytes32 tokenB_ATA = LibAssociatedTokenData.getAssociatedTokenAccount(tokenBMint, payerAccount);

        IERC20ForSpl(tokenA).transferFrom(msg.sender, address(this), amountTokenA);
        IERC20ForSpl(tokenA).transferSolana(
            tokenA_ATA,
            amountTokenA
        );

        IERC20ForSpl(tokenB).transferFrom(msg.sender, address(this), amountTokenB);
        IERC20ForSpl(tokenB).transferSolana(
            tokenB_ATA,
            amountTokenB
        );

        bytes32[] memory premadeAccounts = new bytes32[](13);
        premadeAccounts[0] = payerAccount;
        premadeAccounts[4] = tokenA_ATA;
        premadeAccounts[5] = tokenB_ATA;

        (
            bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibRaydiumProgram.addLiquidityInstruction(poolId, inputAmount, baseIn, slippage, true, premadeAccounts);
        require(accounts[10] == tokenAMint && accounts[11] == tokenBMint, InvalidTokens());

        CALL_SOLANA.execute(
            0,
            CallSolanaHelperLib.prepareSolanaInstruction(
                Constants.getCreateCPMMPoolProgramId(),
                accounts,
                isSigner,
                isWritable,
                data
            )
        );
    }

    function withdrawLiquidity(
        bytes32 poolId,
        address tokenA,
        address tokenB,
        uint64 lpAmount,
        uint16 slippage
    ) public {
        bytes32 tokenAMint = IERC20ForSpl(tokenA).tokenMint();
        bytes32 tokenBMint = IERC20ForSpl(tokenB).tokenMint();

        bytes32[] memory premadeAccounts = new bytes32[](14);
        premadeAccounts[4] = getNeonArbitraryTokenAccount(tokenA, msg.sender);
        premadeAccounts[5] = getNeonArbitraryTokenAccount(tokenB, msg.sender);

        (
            bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibRaydiumProgram.withdrawLiquidityInstruction(poolId, lpAmount, slippage, true, premadeAccounts);
        require(accounts[10] == tokenAMint && accounts[11] == tokenBMint, InvalidTokens());

        CALL_SOLANA.execute(
            0,
            CallSolanaHelperLib.prepareSolanaInstruction(
                Constants.getCreateCPMMPoolProgramId(),
                accounts,
                isSigner,
                isWritable,
                data
            )
        );
    }

    function lockLiquidity(
        bytes32 poolId,
        uint64 lpAmount,
        bool withMetadata,
        bytes32 salt
    ) public returns(bytes32) {
        (
            uint64 lamports,
            bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibRaydiumProgram.lockLiquidityInstruction(
            poolId, 
            lpAmount, 
            withMetadata, 
            salt, 
            true,
            new bytes32[](0)
        );

        CALL_SOLANA.executeWithSeed(
            lamports,
            salt,
            CallSolanaHelperLib.prepareSolanaInstruction(
                Constants.getLockCPMMPoolProgramId(),
                accounts,
                isSigner,
                isWritable,
                data
            )
        );
        
        return accounts[4]; // NFT Mint account
    }

    function collectFees(
        bytes32 poolId,
        address tokenA,
        address tokenB,
        uint64 lpFeeAmount,
        bytes32 salt
    ) public {
        bytes32 tokenAMint = IERC20ForSpl(tokenA).tokenMint();
        bytes32 tokenBMint = IERC20ForSpl(tokenB).tokenMint();

        bytes32[] memory premadeAccounts = new bytes32[](18);
        premadeAccounts[8] = getNeonArbitraryTokenAccount(tokenA, msg.sender);
        premadeAccounts[9] = getNeonArbitraryTokenAccount(tokenB, msg.sender);

        (
            bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibRaydiumProgram.collectFeesInstruction(poolId, lpFeeAmount, salt, true, premadeAccounts);
        require(accounts[12] == tokenAMint && accounts[13] == tokenBMint, InvalidTokens());

        CALL_SOLANA.execute(
            0,
            CallSolanaHelperLib.prepareSolanaInstruction(
                Constants.getLockCPMMPoolProgramId(),
                accounts,
                isSigner,
                isWritable,
                data
            )
        );
    }

    function swapInput(
        bytes32 poolId,
        address inputToken,
        address outputToken,
        uint64 amountIn,
        uint16 slippage
    ) public {
        bytes32 inputTokenMint = IERC20ForSpl(inputToken).tokenMint();
        bytes32 outputTokenMint = IERC20ForSpl(outputToken).tokenMint();
        bytes32 payerAccount = CALL_SOLANA.getPayer();
        bytes32 inputToken_ATA = LibAssociatedTokenData.getAssociatedTokenAccount(inputTokenMint, payerAccount);

        IERC20ForSpl(inputToken).transferFrom(msg.sender, address(this), amountIn);
        IERC20ForSpl(inputToken).transferSolana(
            inputToken_ATA,
            amountIn
        );

        bytes32[] memory premadeAccounts = new bytes32[](13);
        premadeAccounts[0] = payerAccount;
        premadeAccounts[4] = inputToken_ATA;
        premadeAccounts[5] = getNeonArbitraryTokenAccount(outputToken, msg.sender);

        (
            bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibRaydiumProgram.swapInputInstruction(poolId, inputTokenMint, amountIn, slippage, true, premadeAccounts);
        require(accounts[10] == inputTokenMint && accounts[11] == outputTokenMint, InvalidTokens());

        CALL_SOLANA.execute(
            0,
            CallSolanaHelperLib.prepareSolanaInstruction(
                Constants.getCreateCPMMPoolProgramId(),
                accounts,
                isSigner,
                isWritable,
                data
            )
        );
    }

    function swapOutput(
        bytes32 poolId,
        address inputToken,
        address outputToken,
        uint64 amountOut,
        uint64 amountInMax,
        uint16 slippage
    ) public {
        bytes32 inputTokenMint = IERC20ForSpl(inputToken).tokenMint();
        bytes32 outputTokenMint = IERC20ForSpl(outputToken).tokenMint();
        bytes32 payerAccount = CALL_SOLANA.getPayer();
        bytes32 inputToken_ATA = LibAssociatedTokenData.getAssociatedTokenAccount(inputTokenMint, payerAccount);
        uint64 payerTokenABalance = LibSPLTokenData.getSPLTokenAccountBalance(inputToken_ATA);

        IERC20ForSpl(inputToken).transferFrom(msg.sender, address(this), amountInMax);
        IERC20ForSpl(inputToken).transferSolana(
            inputToken_ATA,
            amountInMax
        );

        bytes32[] memory premadeAccounts = new bytes32[](13);
        premadeAccounts[0] = payerAccount;
        premadeAccounts[4] = inputToken_ATA;
        premadeAccounts[5] = getNeonArbitraryTokenAccount(outputToken, msg.sender);
        (
            bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibRaydiumProgram.swapOutputInstruction(poolId, inputTokenMint, amountOut, slippage, true, premadeAccounts);
        require(accounts[10] == inputTokenMint && accounts[11] == outputTokenMint, InvalidTokens());

        CALL_SOLANA.execute(
            0,
            CallSolanaHelperLib.prepareSolanaInstruction(
                Constants.getCreateCPMMPoolProgramId(),
                accounts,
                isSigner,
                isWritable,
                data
            )
        );

        // send swap output action leftovers back to msg.sender
        uint64 payerTokenABalanceAfter = LibSPLTokenData.getSPLTokenAccountBalance(inputToken_ATA);
        if (payerTokenABalanceAfter > payerTokenABalance) {
            (   bytes32[] memory accountsTransfer,
                bool[] memory isSignerTransfer,
                bool[] memory isWritableTransfer,
                bytes memory dataTransfer
            ) = LibSPLTokenProgram.formatTransferInstruction(
                inputToken_ATA,
                getNeonArbitraryTokenAccount(inputToken, msg.sender),
                payerTokenABalanceAfter - payerTokenABalance
            );

            CALL_SOLANA.execute(
                0,
                CallSolanaHelperLib.prepareSolanaInstruction(
                    Constants.getTokenProgramId(),
                    accountsTransfer,
                    isSignerTransfer,
                    isWritableTransfer,
                    dataTransfer
                )
            );
        }
    }

    /// @notice This method serve as an example of how to deal with having to request chain of multiple instructions.
    /// @notice In such scenarios for better effiency it's better to prepare as much as possible instruction data before the very first composability request.
    /// @notice This is due to limitation that after the first composability request we're limited in the amount of Solidity logic that can be performed.
    /// @notice In this example instruction #2 is depending on the output of instruction #1 - knowing the total amount of LP to be locked can be defined only after the pool creation.
    /// @notice For this reason we pass false returnData to instruction #2, because we don't want to build the instruction data yet. ( we don't know the total LP amount before the pool creation )
    /// @notice Before the first composability request we prepare instruction #1 and part of instruction #2. Instruction #2 data will be fully prepared after the execution of instruction #1 has finished.
    /// @notice When instruction #1 has been processed we can request the pool's total LP amount and attach it to the instruction data of instruction #2. Now we're good to perform the instruction #2 as well.
    function createPoolAndLockLP(
        address tokenA,
        address tokenB,
        uint64 mintAAmount,
        uint64 mintBAmount,
        uint64 startTime,
        bytes32 salt,
        bool withMetadata
    ) public returns (bytes32, uint64, bytes32) {
        bytes32 tokenAMint = IERC20ForSpl(tokenA).tokenMint();
        bytes32 tokenBMint = IERC20ForSpl(tokenB).tokenMint();
        bytes32 payerAccount = CALL_SOLANA.getPayer();
        bytes32 tokenA_ATA = LibAssociatedTokenData.getAssociatedTokenAccount(tokenAMint, payerAccount);
        bytes32 tokenB_ATA = LibAssociatedTokenData.getAssociatedTokenAccount(tokenBMint, payerAccount);

        IERC20ForSpl(tokenA).transferFrom(msg.sender, address(this), mintAAmount);
        IERC20ForSpl(tokenA).transferSolana(
            tokenA_ATA,
            mintAAmount
        );

        IERC20ForSpl(tokenB).transferFrom(msg.sender, address(this), mintBAmount);
        IERC20ForSpl(tokenB).transferSolana(
            tokenB_ATA,
            mintBAmount
        );

        bytes32[] memory premadeAccounts = new bytes32[](20);
        premadeAccounts[0] = payerAccount;
        premadeAccounts[7] = tokenA_ATA;
        premadeAccounts[8] = tokenB_ATA;

        // build instruction #1 - Creation of a pool
        (
            uint64 lamports,
            bytes32[] memory accounts,
            bool[] memory isSigner,
            bool[] memory isWritable,
            bytes memory data
        ) = LibRaydiumProgram.createPoolInstruction(tokenAMint, tokenBMint, mintAAmount, mintBAmount, startTime, 0, true, premadeAccounts);
        bytes32 poolId = accounts[3];
        if (salt == bytes32(0)) {
            salt = poolId;
        }

        // Semi-build instruction #2 - Locking of LP
        bytes32[] memory premadeLockLPAccounts = new bytes32[](19);
        premadeLockLPAccounts[1] = accounts[0];
        premadeLockLPAccounts[8] = accounts[6];
        premadeLockLPAccounts[9] = accounts[9];
        premadeLockLPAccounts[11] = accounts[10];
        premadeLockLPAccounts[12] = accounts[11];
        (
            uint64 lamportsLock,
            bytes32[] memory accountsLock,
            bool[] memory isSignerLock,
            bool[] memory isWritableLock,
            bytes memory dataLock
        ) = LibRaydiumProgram.lockLiquidityInstruction(poolId, 0, withMetadata, salt, false, premadeLockLPAccounts);

        bytes memory lockInstruction = CallSolanaHelperLib.prepareSolanaInstruction(
            Constants.getLockCPMMPoolProgramId(),
            accountsLock,
            isSignerLock,
            isWritableLock,
            dataLock
        );

        // First composability request to Solana - no more iterative execution of the Solidity logic
        CALL_SOLANA.execute(
            lamports,
            CallSolanaHelperLib.prepareSolanaInstruction(
                Constants.getCreateCPMMPoolProgramId(),
                accounts,
                isSigner,
                isWritable,
                data
            )
        );
        
        // Building the instruction data for the second composability request
        uint64 lpBalance = LibSPLTokenData.getSPLTokenAccountBalance(accountsLock[9]);
        bytes memory lockInstructionData = LibRaydiumProgram.buildLockLiquidityData(
            lpBalance,
            withMetadata
        );

        // Second composability request to Solana
        CALL_SOLANA.executeWithSeed(
            lamportsLock,
            salt,
            abi.encodePacked(
                lockInstruction,
                uint64(lockInstructionData.length).readLittleEndianUnsigned64(),
                lockInstructionData
            )
        );

        return (
            poolId, // Raydium CPMM Pool account
            lpBalance, // locked LP amount
            accountsLock[4] // NFT Mint account
        );
    }

    function getNeonAddress(address evm_address) public view returns(bytes32) {
        return CALL_SOLANA.getNeonAddress(evm_address);
    }

    function getPayer() public view returns(bytes32) {
        return CALL_SOLANA.getPayer();
    }

    function getExtAuthority(bytes32 salt) external view returns (bytes32) {
        return CALL_SOLANA.getExtAuthority(salt);
    }

    function getTokenReserve(bytes32 poolId, bytes32 tokenMint) public view returns(uint64) {
        return LibRaydiumData.getTokenReserve(poolId, tokenMint);
    }

    function getPoolLpAmount(bytes32 poolId) public view returns(uint64) {
        return LibRaydiumData.getPoolLpAmount(poolId);
    }

    function getPdaLpMint(bytes32 poolId) public view returns(bytes32) {
        return LibRaydiumData.getPdaLpMint(poolId);  
    }

    function lpToAmount(
        uint64 lp,
        uint64 poolAmountA,
        uint64 poolAmountB,
        uint64 supply
    ) public pure returns(uint64, uint64) {
        return LibRaydiumData.lpToAmount(lp, poolAmountA, poolAmountB, supply);
    }

    function getConfigAccount(uint16 index) public view returns(bytes32) {
        return LibRaydiumData.getConfigAccount(index);
    }

    function getConfigData(uint16 index) public view returns(LibRaydiumData.ConfigData memory) {
        return LibRaydiumData.getConfigData(LibRaydiumData.getConfigAccount(index));
    }

    function getCpmmPdaPoolId(
        uint16 index,
        bytes32 tokenA,
        bytes32 tokenB
    ) public view returns(bytes32) {
        return LibRaydiumData.getCpmmPdaPoolId(LibRaydiumData.getConfigAccount(index), tokenA, tokenB);
    }

    function getPoolData(
        uint16 index,
        bytes32 tokenA,
        bytes32 tokenB
    ) public view returns(LibRaydiumData.PoolData memory) {
        return LibRaydiumData.getPoolData(LibRaydiumData.getCpmmPdaPoolId(LibRaydiumData.getConfigAccount(index), tokenA, tokenB));
    }

    function getSwapOutput(
        bytes32 poolId,
        bytes32 configAccount,
        bytes32 inputToken,
        bytes32 outputToken,
        uint64 sourceAmount
    ) public view returns(uint64) {
        return LibRaydiumData.getSwapOutput(poolId, configAccount, inputToken, outputToken, sourceAmount);
    }

    function getSwapInput(
        bytes32 poolId,
        bytes32 configAccount,
        bytes32 inputToken,
        bytes32 outputToken,
        uint64 outputAmount
    ) public view returns(uint64) {
        return LibRaydiumData.getSwapInput(poolId, configAccount, inputToken, outputToken, outputAmount);
    }

    // Temporary method as in Erc20ForSpl V1 solanaAccount method is private, to be removed when Erc20ForSpl V2 is out
    function getNeonArbitraryTokenAccount(address token, address evm_address) public view returns (bytes32) {
        return CALL_SOLANA.getSolanaPDA(
            Constants.getNeonEvmProgramId(),
            abi.encodePacked(
                hex"03",
                hex"436f6e747261637444617461", // ContractData
                token,
                bytes32(uint256(uint160((evm_address))))
            )
        );
    }
}