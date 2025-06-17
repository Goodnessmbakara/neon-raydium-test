// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./CallRaydiumProgram.sol";
import "./libraries/raydium-program/LibRaydiumData.sol";
import "./libraries/raydium-program/LibRaydiumProgram.sol";

contract DynamicFeeRaydiumAMM is CallRaydiumProgram {
    // Constants - using smaller numbers to reduce gas
    uint256 private constant BASE_FEE = 30; // 0.3%
    uint256 private constant MAX_FEE = 100; // 1%
    uint256 private constant MAX_UTILIZATION_RATE = 10000; // 100%
    uint256 private constant UTILIZATION_MULTIPLIER = 20; // 0.2%
    uint256 private constant TIME_MULTIPLIER = 10; // 0.1%
    uint256 private constant PRICE_IMPACT_MULTIPLIER = 50; // 0.5%

    // Events
    event FeeUpdated(bytes32 indexed poolId, uint256 newFee);
    event PoolStateUpdated(
        bytes32 indexed poolId,
        uint256 utilizationRate,
        uint256 totalVolume
    );

    // Optimized pool state tracking - using uint128 to save gas
    struct PoolState {
        uint128 totalVolume;
        uint64 lastUpdateTime;
        uint32 baseFee;
        uint32 currentFee;
    }

    mapping(bytes32 => PoolState) public poolStates;

    // Constructor
    constructor() CallRaydiumProgram() {}

    // Combined fee calculation function to reduce gas
    function calculateFee(
        bytes32 poolId,
        uint256 amount,
        uint256 priceImpact
    ) public view returns (uint256) {
        PoolState storage state = poolStates[poolId];

        // Calculate all adjustments in one go to save gas
        uint256 utilizationRate = (state.totalVolume * 10000) /
            (state.totalVolume + amount);
        if (utilizationRate > MAX_UTILIZATION_RATE)
            utilizationRate = MAX_UTILIZATION_RATE;

        uint256 totalFee = (amount * state.baseFee) / 10000; // Base fee
        totalFee += (utilizationRate * UTILIZATION_MULTIPLIER) / 10000; // Utilization
        totalFee +=
            ((block.timestamp - state.lastUpdateTime) * TIME_MULTIPLIER) /
            10000; // Time
        totalFee += (priceImpact * PRICE_IMPACT_MULTIPLIER) / 10000; // Price impact

        return totalFee > MAX_FEE ? MAX_FEE : totalFee;
    }

    // Optimized pool state update
    function updatePoolState(
        bytes32 poolId,
        uint256 amount,
        uint256 priceImpact
    ) internal {
        PoolState storage state = poolStates[poolId];

        // Update state in one go
        state.totalVolume += uint128(amount);
        state.lastUpdateTime = uint64(block.timestamp);
        state.currentFee = uint32(calculateFee(poolId, amount, priceImpact));

        emit PoolStateUpdated(
            poolId,
            (state.totalVolume * 10000) / (state.totalVolume + amount),
            state.totalVolume
        );
        emit FeeUpdated(poolId, state.currentFee);
    }

    // Override createPool to include dynamic fee initialization
    function createPoolWithDynamicFees(
        address tokenA,
        address tokenB,
        uint64 mintAAmount,
        uint64 mintBAmount,
        uint64 startTime
    ) external returns (bytes32) {
        bytes32 poolId = createPool(
            tokenA,
            tokenB,
            mintAAmount,
            mintBAmount,
            startTime
        );

        // Initialize pool state with optimized storage
        poolStates[poolId] = PoolState({
            totalVolume: 0,
            lastUpdateTime: uint64(block.timestamp),
            baseFee: uint32(BASE_FEE),
            currentFee: uint32(BASE_FEE)
        });

        return poolId;
    }

    // Override swapInput to include dynamic fees
    function swapInputWithDynamicFees(
        bytes32 poolId,
        address inputToken,
        address outputToken,
        uint64 amountIn,
        uint16 slippage,
        uint256 priceImpact
    ) external {
        uint256 fee = calculateFee(poolId, amountIn, priceImpact);
        updatePoolState(poolId, amountIn, priceImpact);
        swapInput(
            poolId,
            inputToken,
            outputToken,
            amountIn - uint64(fee),
            slippage
        );
    }

    // Override swapOutput to include dynamic fees
    function swapOutputWithDynamicFees(
        bytes32 poolId,
        address inputToken,
        address outputToken,
        uint64 amountOut,
        uint64 amountInMax,
        uint16 slippage,
        uint256 priceImpact
    ) external {
        uint256 fee = calculateFee(poolId, amountInMax, priceImpact);
        updatePoolState(poolId, amountInMax, priceImpact);
        swapOutput(
            poolId,
            inputToken,
            outputToken,
            amountOut,
            amountInMax - uint64(fee),
            slippage
        );
    }
}
