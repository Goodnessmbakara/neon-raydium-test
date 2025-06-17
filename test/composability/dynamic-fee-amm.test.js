import { network, globalOptions } from "hardhat"
import { expect } from "chai"
import {
    NATIVE_MINT
} from '@solana/spl-token'
import { deployContract, setupSPLTokens, setupATAAccounts, approveSplTokens } from "./utils.js"
import { getSecrets } from "../../neon-secrets.js";

describe('DynamicFeeRaydiumAMM', function() {
    console.log("\nNetwork name: " + globalOptions.network)

    const RECEIPTS_COUNT = 1;
    const tokenA = NATIVE_MINT.toBase58(); // wSOL
    const WSOL = "0xc7Fc9b46e479c5Cb42f6C458D1881e55E6B7986c";
    // Store the deployed contract address
    const DYNAMIC_FEE_AMM_ADDRESS = "0x6486cE1d816177055e9896Ed0B17757c63Cc473C";
    let ethers,
        deployer,
        neonEVMUser,
        DynamicFeeAMM,
        payer,
        tokenA_Erc20ForSpl,
        tokenB,
        tokenB_Erc20ForSpl,
        poolId

    before(async function() {
        console.log("\n🔧 Setting up test environment...");
        
        const { wallets } = await getSecrets()
        console.log("\n👤 Loaded wallet addresses:");
        console.log("Owner:", wallets.owner.address);
        console.log("User1:", wallets.user1.address);
        
        ethers = (await network.connect()).ethers
        console.log("\n📡 Connected to network");
        
        console.log("\n🚀 Deploying contract...");
        const deployment = await deployContract(wallets.owner, wallets.user1, 'DynamicFeeRaydiumAMM', DYNAMIC_FEE_AMM_ADDRESS);
        deployer = deployment.deployer
        neonEVMUser = deployment.user
        DynamicFeeAMM = deployment.contract
        console.log("Contract deployed at:", DynamicFeeAMM.target);
        
        console.log("\n💰 Getting payer...");
        payer = await DynamicFeeAMM.getPayer();
        console.log("Payer:", payer);
        
        console.log("\n🪙 Setting up SPL tokens...");
        tokenB = await setupSPLTokens(wallets.solanaUser1);
        console.log("TokenA (wSOL):", tokenA);
        console.log("TokenB:", tokenB);

        // Setup ATA accounts
        await setupATAAccounts(
            wallets.solanaUser1,
            ethers.encodeBase58(payer),
            [tokenA, tokenB]
        );

        const erc20ForSplFactory = await ethers.getContractFactory('contracts/token/ERC20ForSpl/erc20_for_spl.sol:ERC20ForSpl', deployer);
        tokenA_Erc20ForSpl = erc20ForSplFactory.attach(WSOL);

        // Deploy ERC20ForSpl for tokenB
        tokenB_Erc20ForSpl = await ethers.deployContract("contracts/token/ERC20ForSpl/erc20_for_spl.sol:ERC20ForSpl", [ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(tokenB)), 32)], wallets.owner);
        await tokenB_Erc20ForSpl.waitForDeployment();

        // Approve tokens
        let [approvedTokenA, approverTokenB] = await approveSplTokens(
            wallets.solanaUser1,
            tokenA,
            tokenB, 
            tokenA_Erc20ForSpl, 
            tokenB_Erc20ForSpl, 
            deployer
        );

        // Claim tokens
        let tx = await tokenA_Erc20ForSpl.connect(deployer).claim(
            ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(approvedTokenA)), 32),
            ethers.parseUnits('0.05', 9)
        );
        await tx.wait(RECEIPTS_COUNT);

        tx = await tokenB_Erc20ForSpl.connect(deployer).claim(
            ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(approverTokenB)), 32),
            ethers.parseUnits('1000', 9)
        );
        await tx.wait(RECEIPTS_COUNT);

        // Approve contract
        tx = await tokenA_Erc20ForSpl.connect(deployer).approve(DynamicFeeAMM.target, ethers.MaxUint256);
        await tx.wait(RECEIPTS_COUNT);

        tx = await tokenB_Erc20ForSpl.connect(deployer).approve(DynamicFeeAMM.target, ethers.MaxUint256);
        await tx.wait(RECEIPTS_COUNT);
    });

    describe('Dynamic Fee AMM Tests', function() {
        it('should create pool with dynamic fees', async function() {
            const initialTokenABalance = await tokenA_Erc20ForSpl.balanceOf(deployer.address);
            const initialTokenBBalance = await tokenB_Erc20ForSpl.balanceOf(deployer.address);

            let tx = await DynamicFeeAMM.connect(deployer).createPoolWithDynamicFees(
                tokenA_Erc20ForSpl.target,
                tokenB_Erc20ForSpl.target,
                20000000,
                10000000,
                0
            );
            await tx.wait(RECEIPTS_COUNT);

            poolId = await DynamicFeeAMM.getCpmmPdaPoolId(
                0,
                ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(tokenA)), 32),
                ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(tokenB)), 32)
            );

            // Verify pool state
            const poolState = await DynamicFeeAMM.poolStates(poolId);
            expect(poolState.baseFee).to.equal(30); // 0.3%
            expect(poolState.currentFee).to.equal(30); // 0.3%
            expect(poolState.totalVolume).to.equal(0);
            expect(poolState.utilizationRate).to.equal(0);
        });

        it('should calculate fees correctly', async function() {
            const amount = 1000000;
            const priceImpact = 100; // 1%

            // Test utilization adjustment
            const utilizationAdjustment = await DynamicFeeAMM.calculateUtilizationAdjustment(5000); // 50%
            expect(utilizationAdjustment).to.equal(10); // 0.1%

            // Test time adjustment
            const timeAdjustment = await DynamicFeeAMM.calculateTimeAdjustment(
                (await ethers.provider.getBlock('latest')).timestamp - 3600 // 1 hour ago
            );
            expect(timeAdjustment).to.be.gt(0);

            // Test price impact adjustment
            const impactAdjustment = await DynamicFeeAMM.calculateImpactAdjustment(priceImpact);
            expect(impactAdjustment).to.equal(5); // 0.05%

            // Test total fee calculation
            const fee = await DynamicFeeAMM.calculateFee(poolId, amount, priceImpact);
            expect(fee).to.be.gt(0);
            expect(fee).to.be.lte(100); // Max fee is 1%
        });

        it('should update pool state correctly', async function() {
            const amount = 1000000;
            const priceImpact = 100; // 1%

            // Get initial state
            const initialState = await DynamicFeeAMM.poolStates(poolId);

            // Simulate a swap to update state using dynamic fees
            const tx = await DynamicFeeAMM.connect(deployer).swapInputWithDynamicFees(
                poolId,
                tokenA_Erc20ForSpl.target,
                tokenB_Erc20ForSpl.target,
                200000,
                100, // slippage 1%
                priceImpact
            );
            await tx.wait(RECEIPTS_COUNT);

            // Get updated state
            const updatedState = await DynamicFeeAMM.poolStates(poolId);
            expect(updatedState.totalVolume).to.be.gt(initialState.totalVolume);
            expect(updatedState.lastUpdateTime).to.be.gt(initialState.lastUpdateTime);
            expect(updatedState.currentFee).to.be.gt(initialState.currentFee);
        });

        it('should handle swapOutput with dynamic fees', async function() {
            const amountOut = 100000;
            const amountInMax = 200000;
            const priceImpact = 100; // 1%

            // Get initial state
            const initialState = await DynamicFeeAMM.poolStates(poolId);

            // Execute swapOutput with dynamic fees
            const tx = await DynamicFeeAMM.connect(deployer).swapOutputWithDynamicFees(
                poolId,
                tokenA_Erc20ForSpl.target,
                tokenB_Erc20ForSpl.target,
                amountOut,
                amountInMax,
                100, // slippage 1%
                priceImpact
            );
            await tx.wait(RECEIPTS_COUNT);

            // Get updated state
            const updatedState = await DynamicFeeAMM.poolStates(poolId);
            expect(updatedState.totalVolume).to.be.gt(initialState.totalVolume);
            expect(updatedState.lastUpdateTime).to.be.gt(initialState.lastUpdateTime);
            expect(updatedState.currentFee).to.be.gt(initialState.currentFee);
        });
    });
}); 