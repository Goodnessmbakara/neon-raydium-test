import { network, globalOptions } from "hardhat"
import { expect } from "chai"
import {
    NATIVE_MINT
} from '@solana/spl-token'
import { deployContract, setupSPLTokens, setupATAAccounts, approveSplTokens } from "./utils.js"
import { getSecrets } from "../../neon-secrets.js";

describe('LibRaydiumProgram', function() {
    console.log("\nNetwork name: " + globalOptions.network)

    const RECEIPTS_COUNT = 1;
    const tokenA = NATIVE_MINT.toBase58(); // wSOL
    const WSOL = "0xc7Fc9b46e479c5Cb42f6C458D1881e55E6B7986c";
    let ethers,
        deployer,
        neonEVMUser,
        CallRaydiumProgram,
        payer,
        tokenA_Erc20ForSpl,
        tokenB,
        tokenB_Erc20ForSpl,
        poolId

    before(async function() {
        const { wallets } = await getSecrets()
        ethers = (await network.connect()).ethers
        const deployment = await deployContract(wallets.owner, wallets.user1, 'CallRaydiumProgram', null);
        deployer = deployment.deployer
        neonEVMUser = deployment.user
        CallRaydiumProgram = deployment.contract
        payer = await CallRaydiumProgram.getPayer();
        tokenB = await setupSPLTokens(wallets.solanaUser1);
        console.log(tokenA, 'tokenA');
        console.log(tokenB, 'tokenB');

        // setup ATA accounts for our CallRaydiumProgram's payer
        await setupATAAccounts(
            wallets.solanaUser1,
            ethers.encodeBase58(payer),
            [tokenA, tokenB]
        );

        const erc20ForSplFactory = await ethers.getContractFactory('contracts/token/ERC20ForSpl/erc20_for_spl.sol:ERC20ForSpl', deployer);
        tokenA_Erc20ForSpl = erc20ForSplFactory.attach(WSOL);

        // deploy ERC20ForSpl interface for fresh minted spltoken tokenB
        tokenB_Erc20ForSpl = await ethers.deployContract("contracts/token/ERC20ForSpl/erc20_for_spl.sol:ERC20ForSpl", [ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(tokenB)), 32)], wallets.owner);
        await tokenB_Erc20ForSpl.waitForDeployment();

        console.log(
            `tokenB_Erc20ForSpl deployed to ${tokenB_Erc20ForSpl.target}`
        );

        // approve tokenA and tokenB to be claimed by deployer
        let [approvedTokenA, approverTokenB] = await approveSplTokens(
            wallets.solanaUser1,
            tokenA, 
            tokenB, 
            tokenA_Erc20ForSpl, 
            tokenB_Erc20ForSpl, 
            deployer
        );

        // claim tokenA
        let tx = await tokenA_Erc20ForSpl.connect(deployer).claim(
            ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(approvedTokenA)), 32),
            ethers.parseUnits('0.05', 9)
        );
        await tx.wait(RECEIPTS_COUNT);
        console.log(await tokenA_Erc20ForSpl.balanceOf(deployer.address), 'tokenA balanceOf');

        // claim tokenB
        tx = await tokenB_Erc20ForSpl.connect(deployer).claim(
            ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(approverTokenB)), 32),
            ethers.parseUnits('1000', 9)
        );
        await tx.wait(RECEIPTS_COUNT);
        console.log(await tokenB_Erc20ForSpl.balanceOf(deployer.address), 'tokenB balanceOf');

        // grant maximum approval of tokenA and tokenB to CallRaydiumProgram
        tx = await tokenA_Erc20ForSpl.connect(deployer).approve(CallRaydiumProgram.target, ethers.MaxUint256);
        await tx.wait(RECEIPTS_COUNT);

        tx = await tokenB_Erc20ForSpl.connect(deployer).approve(CallRaydiumProgram.target, ethers.MaxUint256);
        await tx.wait(RECEIPTS_COUNT);
    })

    describe('Tests', function() {
        it('createPoolAndLockLP', async function() {
            const initialTokenABalance = await tokenA_Erc20ForSpl.balanceOf(deployer.address);
            const initialTokenBBalance = await tokenB_Erc20ForSpl.balanceOf(deployer.address);

            let tx = await CallRaydiumProgram.connect(deployer).createPoolAndLockLP(
                tokenA_Erc20ForSpl.target,
                tokenB_Erc20ForSpl.target,
                20000000,
                10000000,
                0,
                ethers.zeroPadValue(ethers.toBeHex(deployer.address), 32), // salt
                true
            );
            await tx.wait(RECEIPTS_COUNT);
            console.log(tx, 'tx createPool');

            poolId = await CallRaydiumProgram.getCpmmPdaPoolId(
                0,
                ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(tokenA)), 32),
                ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(tokenB)), 32)
            )
            console.log(poolId, 'poolId');

            expect(initialTokenABalance).to.be.greaterThan(await tokenA_Erc20ForSpl.balanceOf(deployer.address));
            expect(initialTokenBBalance).to.be.greaterThan(await tokenB_Erc20ForSpl.balanceOf(deployer.address));
        });

        it('swapInput', async function() {
            const initialTokenABalance = await tokenA_Erc20ForSpl.balanceOf(deployer.address);
            const initialTokenBBalance = await tokenB_Erc20ForSpl.balanceOf(deployer.address);
            
            let tx = await CallRaydiumProgram.connect(deployer).swapInput(
                poolId,
                tokenA_Erc20ForSpl.target,
                tokenB_Erc20ForSpl.target,
                200000,
                1 // slippage 0.01%
            );
            await tx.wait(RECEIPTS_COUNT);
            console.log(tx, 'tx swapInput');

            expect(initialTokenABalance).to.be.greaterThan(await tokenA_Erc20ForSpl.balanceOf(deployer.address));
            expect(await tokenB_Erc20ForSpl.balanceOf(deployer.address)).to.be.greaterThan(initialTokenBBalance);
        });

        it('collectFees', async function() {
            const initialTokenABalance = await tokenA_Erc20ForSpl.balanceOf(deployer.address);
            const initialTokenBBalance = await tokenB_Erc20ForSpl.balanceOf(deployer.address);
            
            let tx = await CallRaydiumProgram.connect(deployer).collectFees(
                poolId,
                tokenA_Erc20ForSpl.target,
                tokenB_Erc20ForSpl.target,
                '18446744073709551615', // withdraw maximum available fees
                ethers.zeroPadValue(ethers.toBeHex(deployer.address), 32) // salt
            );
            await tx.wait(RECEIPTS_COUNT);
            console.log(tx, 'tx collectFees');

            expect(await tokenA_Erc20ForSpl.balanceOf(deployer.address)).to.be.greaterThan(initialTokenABalance);
            expect(await tokenB_Erc20ForSpl.balanceOf(deployer.address)).to.be.greaterThan(initialTokenBBalance);
        });
    });
});
