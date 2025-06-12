import hre, { network, globalOptions } from "hardhat"
import { expect } from "chai"
import web3 from "@solana/web3.js"
import {
    getAssociatedTokenAddress,
    getAccount,
    createApproveInstruction,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
    createTransferInstruction
} from '@solana/spl-token'
import { getSecrets } from "../../neon-secrets.js";
import utils from './utils.js'
import config from '../config.js'
import "dotenv/config"

const connection = new web3.Connection(config.svm_node[globalOptions.network], "processed");
const ERC20ForSPLFactoryAddress = config.token.ERC20ForSplFactory[globalOptions.network];
const ERC20ForSPLAddress = config.token.ERC20ForSpl[globalOptions.network];
const MockVaultAddress = config.token.MockVault[globalOptions.network];
const TOKEN_MINT = utils.publicKeyToBytes32(config.token.ERC20ForSplTokenMint[globalOptions.network]);
const TOKEN_MINT_DECIMALS = 9;
const RECEIPTS_COUNT = 1;
const SOLANA_TX_TIMEOUT = 15000;

let ethers;
let wallets;
let tx;
let approverATAWithTokens;
let ERC20ForSPLFactory;
let ERC20ForSPL;
let MockVault;
let ownerSolanaPublicKey;
let user1SolanaPublicKey;
let user2SolanaPublicKey;
let user3SolanaPublicKey;
let grantedTestersWithBalance;
let neon_getEvmParams;

describe('Test init', async function () {
    before(async function() {
        wallets = (await getSecrets()).wallets
        ethers = (await network.connect()).ethers

        if (await ethers.provider.getBalance(wallets.owner.address) == 0) {
            await utils.airdropNEON(wallets.owner.address);
        }

        if (await connection.getBalance(wallets.solanaUser1.publicKey) == 0) {
            await utils.airdropSOL(wallets.solanaUser1);
        }

        const ERC20ForSplFactoryContractFactory = await ethers.getContractFactory('contracts/token/ERC20ForSpl/erc20_for_spl_factory.sol:ERC20ForSplFactory', wallets.owner);
        const MockVaultFactory = await ethers.getContractFactory('contracts/mocks/MockVault.sol:MockVault', wallets.owner);
        const ERC20ForSplContractFactory = await ethers.getContractFactory('contracts/token/ERC20ForSpl/erc20_for_spl.sol:ERC20ForSpl', wallets.owner);
        
        if (ethers.isAddress(ERC20ForSPLFactoryAddress)) {
            console.log('\nCreating instance of already deployed ERC20ForSPLFactory contract on Neon EVM with address', "\x1b[32m", ERC20ForSPLFactoryAddress, "\x1b[30m", '\n');
            ERC20ForSPLFactory = ERC20ForSplFactoryContractFactory.attach(ERC20ForSPLFactoryAddress);
        } else {
            // deploy ERC20ForSPLFactory
            ERC20ForSPLFactory = await ethers.deployContract('contracts/token/ERC20ForSpl/erc20_for_spl_factory.sol:ERC20ForSplFactory', wallets.owner);
            await ERC20ForSPLFactory.waitForDeployment();
            console.log('\nCreating instance of just now deployed ERC20ForSplFactory contract on Neon EVM with address', "\x1b[32m", ERC20ForSPLFactory.target, "\x1b[30m", '\n'); 
        }

        if (ethers.isAddress(ERC20ForSPLAddress)) {
            console.log('\nCreating instance of already deployed ERC20ForSPL contract on Neon EVM with address', "\x1b[32m", ERC20ForSPLAddress, "\x1b[30m", '\n');
            ERC20ForSPL = ERC20ForSplContractFactory.attach(ERC20ForSPLAddress);
        } else {
            // deploy ERC20ForSPL
            tx = await ERC20ForSPLFactory.createErc20ForSpl(TOKEN_MINT);
            await tx.wait(RECEIPTS_COUNT);

            const getErc20ForSpl = await ERC20ForSPLFactory.getErc20ForSpl(TOKEN_MINT);

            ERC20ForSPL = ERC20ForSplContractFactory.attach(getErc20ForSpl);
            console.log('\nCreating instance of just now deployed ERC20ForSPL contract on Neon EVM with address', "\x1b[32m", ERC20ForSPL.target, "\x1b[30m", '\n');
        }

        if (ethers.isAddress(MockVaultAddress)) {
            console.log('\nCreating instance of already deployed MockVaultAddress contract on Neon EVM with address', "\x1b[32m", MockVaultAddress, "\x1b[30m", '\n');
            MockVault = MockVaultFactory.attach(MockVaultAddress);
        } else {
            // deploying MockVault
            MockVault = await ethers.deployContract(
                'contracts/mocks/MockVault.sol:MockVault',
                [ERC20ForSPL.target],
                wallets.owner
            );
            await MockVault.waitForDeployment();
            console.log('\nCreating instance of just now deployed MockVault contract on Neon EVM with address', "\x1b[32m", MockVault.target, "\x1b[30m", '\n');
        }

        const neon_getEvmParamsRequest = await fetch(hre.userConfig.networks[hre.globalOptions.network].url, {
            method: 'POST',
            body: JSON.stringify({"method":"neon_getEvmParams","params":[],"id":1,"jsonrpc":"2.0"}),
            headers: { 'Content-Type': 'application/json' }
        });
        neon_getEvmParams = await neon_getEvmParamsRequest.json();
        console.log(neon_getEvmParams, 'neon_getEvmParams');

        const TokenMintAccount = await ERC20ForSPL.tokenMint();
        ownerSolanaPublicKey = ethers.encodeBase58(await ERC20ForSPL.solanaAccount(wallets.owner.address));
        user1SolanaPublicKey = ethers.encodeBase58(await ERC20ForSPL.solanaAccount(wallets.user1.address));
        user2SolanaPublicKey = ethers.encodeBase58(await ERC20ForSPL.solanaAccount(wallets.user2.address));
        user3SolanaPublicKey = ethers.encodeBase58(await ERC20ForSPL.solanaAccount(wallets.user3.address));
        console.log('\nTokenMintAccount -', TokenMintAccount);
        console.log('nTokenMintAccount -', ethers.encodeBase58(TokenMintAccount));
        console.log('\nOwner addresses:');
        console.log('Neon EVM address -', wallets.owner.address);
        console.log('Solana data account -', ownerSolanaPublicKey);
        console.log('\nUser1 addresses:');
        console.log('Neon EVM address -', wallets.user1.address);
        console.log('Solana data account -', user1SolanaPublicKey);
        console.log('\nUser2 addresses:');
        console.log('Neon EVM address -', wallets.user2.address);
        console.log('Solana data account -', user2SolanaPublicKey);
        console.log('\nUser3 addresses:');
        console.log('Neon EVM address -', wallets.user3.address);
        console.log('Solana data account -', user3SolanaPublicKey);

        console.log('\n Balances:');
        console.log(await ERC20ForSPL.balanceOf(wallets.owner.address), 'wallets.owner');
        console.log(await ERC20ForSPL.balanceOf(wallets.user1.address), 'wallets.user1');
        console.log(await ERC20ForSPL.balanceOf(wallets.user2.address), 'wallets.user2');
        console.log(await ERC20ForSPL.balanceOf(wallets.user3.address), 'wallets.user3');

        grantedTestersWithBalance = await ERC20ForSPL.balanceOf(wallets.owner.address) != 0 && await ERC20ForSPL.balanceOf(wallets.user1.address) != 0 && await ERC20ForSPL.balanceOf(wallets.user2.address) != 0;
        console.log(grantedTestersWithBalance, 'grantedTestersWithBalance');
        if (!grantedTestersWithBalance) {
            await setupTesters();
            grantedTestersWithBalance = true;

            console.log(await ERC20ForSPL.balanceOf(wallets.owner.address), 'wallets.owner');
            console.log(await ERC20ForSPL.balanceOf(wallets.user1.address), 'wallets.user1');
            console.log(await ERC20ForSPL.balanceOf(wallets.user2.address), 'wallets.user2');
            console.log(await ERC20ForSPL.balanceOf(wallets.user3.address), 'wallets.user3');
        } else {
            const solanaUser4TokenAta = await getAssociatedTokenAddress(
                new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                wallets.solanaUser4.publicKey,
                false
            );
            approverATAWithTokens = solanaUser4TokenAta.toBase58();
        }
    });

    describe('ERC20ForSPL tests', function() {
        describe('ERC20ForSPL backbone tests', function() {
            it('validate first 100 storage slots are empty', async function () {
                for (let i = 0; i < 100; ++i) {
                    expect(await ethers.provider.getStorage(ERC20ForSPL.target, i)).to.eq('0x0000000000000000000000000000000000000000000000000000000000000000');
                }
            });

            it('check PDA accounts calculation', async function () {
                const pdaAccountOnChain = ethers.encodeBase58(await ERC20ForSPL.solanaAccount(wallets.owner.address));
                const pdaAccountOffChain = utils.calculatePdaAccount(
                    'ContractData',
                    ERC20ForSPL.target,
                    wallets.owner.address,
                    new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                )[0].toBase58();
                expect(pdaAccountOnChain).to.eq(pdaAccountOffChain);
            });
    
            it('test claim & claimTo', async function () {
                if (grantedTestersWithBalance) {
                    if (approverATAWithTokens != undefined) {
                        const ownerBalance = await ERC20ForSPL.balanceOf(wallets.owner.address);
                        let tx = await ERC20ForSPL.connect(wallets.owner).claim(
                            utils.publicKeyToBytes32(approverATAWithTokens),
                            ethers.parseUnits('1', TOKEN_MINT_DECIMALS)
                        );
                        await tx.wait(RECEIPTS_COUNT);
    
                        expect(await ERC20ForSPL.balanceOf(wallets.owner.address)).to.be.greaterThan(ownerBalance);
    
                        const user1Balance = await ERC20ForSPL.balanceOf(wallets.user1.address);
                        tx = await ERC20ForSPL.connect(wallets.owner).claimTo(
                            utils.publicKeyToBytes32(approverATAWithTokens),
                            wallets.user1.address,
                            ethers.parseUnits('1', TOKEN_MINT_DECIMALS)
                        );
                        await tx.wait(RECEIPTS_COUNT);
    
                        expect(await ERC20ForSPL.balanceOf(wallets.user1.address)).to.be.greaterThan(user1Balance);
                    } else {
                        console.log('Empty approverATAWithTokens - skipping test');
                        this.skip();
                    }
                } else {
                    this.skip();
                }
            });
    
            it('burn', async function () {
                if (grantedTestersWithBalance) {
                    const ownerBalance = await ERC20ForSPL.balanceOf(wallets.owner.address);
                    const totalSupply = await ERC20ForSPL.totalSupply();
    
                    const burnAmount = ethers.parseUnits('3', TOKEN_MINT_DECIMALS);
                    let tx = await ERC20ForSPL.connect(wallets.owner).burn(burnAmount);
                    await tx.wait(RECEIPTS_COUNT);
    
                    expect(ownerBalance).to.be.greaterThan(await ERC20ForSPL.balanceOf(wallets.owner.address));
                    expect(ownerBalance).to.eq(await ERC20ForSPL.balanceOf(wallets.owner.address) + burnAmount);
                    expect(totalSupply).to.be.greaterThan(await ERC20ForSPL.totalSupply());
                    expect(totalSupply).to.eq(await ERC20ForSPL.totalSupply() + burnAmount);
                } else {
                    this.skip();
                }
            });
    
            it('transfer from user1 to user2', async function () {
                if (grantedTestersWithBalance) {
                    const user1Balance = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2Balance = await ERC20ForSPL.balanceOf(wallets.user2.address);
                    const transferAmount = ethers.parseUnits('5', TOKEN_MINT_DECIMALS);
                    let tx = await ERC20ForSPL.connect(wallets.user1).transfer(wallets.user2.address, transferAmount);
                    await tx.wait(RECEIPTS_COUNT);
    
                    const user1BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user2.address);
                    expect(user1Balance).to.be.greaterThan(user1BalanceAfter);
                    expect(user1Balance).to.eq(user1BalanceAfter + transferAmount);
                    expect(user2BalanceAfter).to.be.greaterThan(user2Balance);
                    expect(user2BalanceAfter).to.eq(user2Balance + transferAmount);
                } else {
                    this.skip();
                }
            });
    
            it('transfer from user2 to user1', async function () {
                if (grantedTestersWithBalance) {
                    const user1Balance = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2Balance = await ERC20ForSPL.balanceOf(wallets.user2.address);
    
                    const transferAmount = ethers.parseUnits('5', TOKEN_MINT_DECIMALS);
                    let tx = await ERC20ForSPL.connect(wallets.user2).transfer(wallets.user1.address, transferAmount);
                    await tx.wait(RECEIPTS_COUNT);
                    
                    const user1BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user2.address);
    
                    expect(user1BalanceAfter).to.be.greaterThan(user1Balance);
                    expect(user1BalanceAfter).to.eq(user1Balance + transferAmount);
                    expect(user2Balance).to.be.greaterThan(user2BalanceAfter);
                    expect(user2Balance).to.eq(user2BalanceAfter + transferAmount);
                } else {
                    this.skip();
                }
            });
    
            it('approve from user2 to user1', async function () {
                if (grantedTestersWithBalance) {
                    const user2Allowance = await ERC20ForSPL.allowance(wallets.user2.address, wallets.user1.address);
    
                    const newApprove = user2Allowance + ethers.parseUnits('10', TOKEN_MINT_DECIMALS);
                    let tx = await ERC20ForSPL.connect(wallets.user2).approve(wallets.user1.address, newApprove);
                    await tx.wait(RECEIPTS_COUNT);
    
                    const user2AllowanceAfter = await ERC20ForSPL.allowance(wallets.user2.address, wallets.user1.address);
                    expect(user2AllowanceAfter).to.be.greaterThan(user2Allowance);
                } else {
                    this.skip();
                }
            });
            
            it('transferFrom from user2 to user1', async function () {
                if (grantedTestersWithBalance) {
                    const user2Allowance = await ERC20ForSPL.allowance(wallets.user2.address, wallets.user1.address);
                    const user1Balance = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2Balance = await ERC20ForSPL.balanceOf(wallets.user2.address);
                    const allowance = await ERC20ForSPL.allowance(wallets.user2.address, wallets.user1.address);
    
                    const transferAmount = ethers.parseUnits('1', TOKEN_MINT_DECIMALS);
                    let tx = await ERC20ForSPL.connect(wallets.user1).transferFrom(wallets.user2.address, wallets.user1.address, transferAmount);
                    await tx.wait(RECEIPTS_COUNT); 
    
                    const allowanceAfter = await ERC20ForSPL.allowance(wallets.user2.address, wallets.user1.address);
                    const user2AllowanceAfter = await ERC20ForSPL.allowance(wallets.user2.address, wallets.user1.address);
                    const user1BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user2.address);
                    expect(allowance).to.be.greaterThan(allowanceAfter);
                    expect(allowance).to.eq(allowanceAfter + transferAmount);
                    expect(user2Allowance).to.be.greaterThan(user2AllowanceAfter);
                    expect(user2Allowance).to.eq(user2AllowanceAfter + transferAmount);
                    expect(user1BalanceAfter).to.be.greaterThan(user1Balance);
                    expect(user1BalanceAfter).to.eq(user1Balance + transferAmount);
                    expect(user2Balance).to.be.greaterThan(user2BalanceAfter);
                    expect(user2Balance).to.eq(user2BalanceAfter + transferAmount);
                } else {
                    this.skip();
                }
            });
    
            it('transferFrom from user1 to MockVault smart contract', async function () {
                if (grantedTestersWithBalance) {
                    const user1Balance = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const mockVaultBalance = await ERC20ForSPL.balanceOf(MockVault.target);
                    const transferAmount = ethers.parseUnits('1', TOKEN_MINT_DECIMALS);

                    let tx = await ERC20ForSPL.connect(wallets.user1).approve(MockVault.target, transferAmount);
                    await tx.wait(RECEIPTS_COUNT);

                    const allowance = await ERC20ForSPL.allowance(wallets.user1.address, MockVault.target);
                    expect(allowance).to.eq(transferAmount);
    
                    tx = await MockVault.connect(wallets.user1).deposit(transferAmount);
                    await tx.wait(RECEIPTS_COUNT);
    
                    const allowanceAfter = await ERC20ForSPL.allowance(wallets.user1.address, MockVault.target);
                    const user1BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const mockVaultBalanceAfter = await ERC20ForSPL.balanceOf(MockVault.target);
                    expect(allowance).to.be.greaterThan(allowanceAfter);
                    expect(allowance).to.eq(allowanceAfter + transferAmount);
                    expect(user1Balance).to.be.greaterThan(user1BalanceAfter);
                    expect(user1Balance).to.eq(user1BalanceAfter + transferAmount);
                    expect(mockVaultBalanceAfter).to.be.greaterThan(mockVaultBalance);
                    expect(mockVaultBalanceAfter).to.eq(mockVaultBalance + transferAmount);
                } else {
                    this.skip();
                }
            });
    
            it('transferSolanaFrom from user1 to MockVault smart contract ( forwarding tokens to Solana account through transferSolanaFrom )', async function () {
                if (grantedTestersWithBalance) {
                    const user1Balance = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const transferAmount = ethers.parseUnits('1', TOKEN_MINT_DECIMALS);
    
                    let tx = await ERC20ForSPL.connect(wallets.user1).approve(MockVault.target, transferAmount);
                    await tx.wait(RECEIPTS_COUNT);
                    const allowance = await ERC20ForSPL.allowance(wallets.user1.address, MockVault.target);
                    expect(allowance).to.eq(transferAmount);

                    const solanaUser1ATA = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser1.publicKey,
                        false
                    );
                    const ataInfo = await getAccount(connection, solanaUser1ATA);
    
                    tx = await MockVault.connect(wallets.user1).depositToSolana(
                        transferAmount,
                        utils.publicKeyToBytes32(solanaUser1ATA.toBase58())
                    );
                    await tx.wait(RECEIPTS_COUNT);
    
                    const ataInfoAfter = await getAccount(connection, solanaUser1ATA);
                    const allowanceAfter = await ERC20ForSPL.allowance(wallets.user1.address, MockVault.target);
                    const user1BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    expect(allowance).to.be.greaterThan(allowanceAfter);
                    expect(allowance).to.eq(allowanceAfter + transferAmount);
                    expect(user1Balance).to.be.greaterThan(user1BalanceAfter);
                    expect(user1Balance).to.eq(user1BalanceAfter + transferAmount);
                    expect(ataInfoAfter.amount).to.be.greaterThan(ataInfo.amount);
                    expect(ataInfoAfter.amount).to.eq(ataInfo.amount + transferAmount);
                } else {
                    this.skip();
                }
            });
    
            it('approveSolana from user1 to user2 and owner; revoke with approveSolana', async function () {
                if (grantedTestersWithBalance) {
                    let amount = ethers.parseUnits('1', TOKEN_MINT_DECIMALS);
                    let tx = await ERC20ForSPL.connect(wallets.user1).approveSolana(await ERC20ForSPL.solanaAccount(wallets.user2.address), amount);
                    await tx.wait(RECEIPTS_COUNT);
                    let accountDelegateData = await ERC20ForSPL.getAccountDelegateData(wallets.user1.address);
                    expect(accountDelegateData[0]).to.eq(await ERC20ForSPL.solanaAccount(wallets.user2.address));
                    expect(accountDelegateData[1]).to.eq(BigInt(amount));
    
                    let amount1 = ethers.parseUnits('2', TOKEN_MINT_DECIMALS);
                    let tx1 = await ERC20ForSPL.connect(wallets.user1).approveSolana(await ERC20ForSPL.solanaAccount(wallets.owner.address), amount1);
                    await tx1.wait(RECEIPTS_COUNT);
                    
                    let accountDelegateData1 = await ERC20ForSPL.getAccountDelegateData(wallets.user1.address);
                    expect(accountDelegateData1[0]).to.eq(await ERC20ForSPL.solanaAccount(wallets.owner.address));
                    expect(accountDelegateData1[1]).to.eq(BigInt(amount1));
    
                    // test revoke approveSolana
                    let tx2 = await ERC20ForSPL.connect(wallets.user1).approveSolana(await ERC20ForSPL.solanaAccount(wallets.owner.address), 0);
                    await tx2.wait(RECEIPTS_COUNT);
                    
                    let accountDelegateData2 = await ERC20ForSPL.getAccountDelegateData(wallets.user1.address);
                    expect(accountDelegateData2[0]).to.eq('0x0000000000000000000000000000000000000000000000000000000000000000');
                    expect(accountDelegateData2[1]).to.eq(0);
                } else {
                    this.skip();
                }
            });
    
            it('approveSolana from user1 to solanaUser1 & perform createTransferInstruction instruction from solanaUser1 on Solana', async function () {
                if (grantedTestersWithBalance) {
                    let transferAmount = ethers.parseUnits('1', TOKEN_MINT_DECIMALS);

                    const solanaUser1ATA = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser1.publicKey,
                        false
                    );
                    const ataInfo = await getAccount(connection, solanaUser1ATA);

                    let tx = await ERC20ForSPL.connect(wallets.user1).approveSolana(
                        utils.publicKeyToBytes32(wallets.solanaUser1.publicKey.toBase58()),
                        transferAmount
                    );
                    await tx.wait(RECEIPTS_COUNT);

                    let accountDelegateData = await ERC20ForSPL.getAccountDelegateData(wallets.user1.address);
                    expect(accountDelegateData[0]).to.eq(utils.publicKeyToBytes32(wallets.solanaUser1.publicKey.toBase58()));
                    expect(accountDelegateData[1]).to.eq(BigInt(transferAmount));

                    const user1PDA = utils.calculatePdaAccount(
                        'ContractData',
                        ERC20ForSPL.target,
                        wallets.user1.address,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    const pdaInfo = await getAccount(connection, user1PDA);
    
                    // spend the allowance given at approveSolana method
                    const transaction = new web3.Transaction();
                    transaction.add(
                        createTransferInstruction(
                            user1PDA,
                            solanaUser1ATA,
                            wallets.solanaUser1.publicKey,
                            transferAmount,
                            []
                        )
                    );
                    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                    transaction.sign(...[wallets.solanaUser1]);

                    const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
                    console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);

                    // wait scheduled tx to be processed
                    await utils.asyncTimeout(SOLANA_TX_TIMEOUT);

                    const ataInfoAfter = await getAccount(connection, solanaUser1ATA);
                    const pdaInfoAfter = await getAccount(connection, user1PDA);
                    expect(ataInfoAfter.amount).to.be.greaterThan(ataInfo.amount);
                    expect(ataInfoAfter.amount).to.eq(ataInfo.amount + transferAmount);
                    expect(pdaInfo.amount).to.be.greaterThan(pdaInfoAfter.amount);
                    expect(pdaInfo.amount).to.eq(pdaInfoAfter.amount + transferAmount);
                    expect(pdaInfoAfter.delegate).to.eq(null);
                    expect(pdaInfoAfter.delegatedAmount).to.eq(0);
                } else {
                    this.skip();
                }
            });
    
            it('transferSolana from user1 to user2', async function () {
                if (grantedTestersWithBalance) {
                    const user1Balance = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2Balance = await ERC20ForSPL.balanceOf(wallets.user2.address);
    
                    const transferAmount = ethers.parseUnits('5', TOKEN_MINT_DECIMALS);
                    let tx = await ERC20ForSPL.connect(wallets.user1).transferSolana(await ERC20ForSPL.solanaAccount(wallets.user2.address), transferAmount);
                    await tx.wait(RECEIPTS_COUNT);
    
                    const user1BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user2.address);
                    expect(user1Balance).to.be.greaterThan(user1BalanceAfter);
                    expect(user1Balance).to.eq(user1BalanceAfter + transferAmount);
                    expect(user2BalanceAfter).to.be.greaterThan(user2Balance);
                    expect(user2BalanceAfter).to.eq(user2Balance + transferAmount);
                } else {
                    this.skip();
                }
            });
    
            it('transferSolana from user2 to user1', async function () {
                if (grantedTestersWithBalance) {
                    const user1Balance = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2Balance = await ERC20ForSPL.balanceOf(wallets.user2.address);
    
                    const transferAmount = ethers.parseUnits('5', TOKEN_MINT_DECIMALS);
                    let tx = await ERC20ForSPL.connect(wallets.user2).transferSolana(await ERC20ForSPL.solanaAccount(wallets.user1.address), transferAmount);
    
                    await tx.wait(RECEIPTS_COUNT);
    
                    const user1BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user1.address);
                    const user2BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user2.address);
                    expect(user1BalanceAfter).to.be.greaterThan(user1Balance);
                    expect(user1BalanceAfter).to.eq(user1Balance + transferAmount);
                    expect(user2Balance).to.be.greaterThan(user2BalanceAfter);
                    expect(user2Balance).to.eq(user2BalanceAfter + transferAmount);
                } else {
                    this.skip();
                }
            });
    
            it('transferSolanaFrom from user2 to solanaUser1 ATA account', async function () {
                if (grantedTestersWithBalance) {
                    const user2Balance = await ERC20ForSPL.balanceOf(wallets.user2.address);
                    const solanaUser1ATA = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser1.publicKey,
                        false
                    );
                    const amountInATAAccount = (await getAccount(connection, solanaUser1ATA)).amount;
                    const transferAmount = ethers.parseUnits('1', TOKEN_MINT_DECIMALS) + 1000n;

                    let tx = await ERC20ForSPL.connect(wallets.user2).approve(wallets.user1.address, transferAmount);
                    await tx.wait(RECEIPTS_COUNT);

                    const allowance = await ERC20ForSPL.allowance(wallets.user2.address, wallets.user1.address);
                    expect(allowance).to.eq(transferAmount);

                    tx = await ERC20ForSPL.connect(wallets.user1).transferSolanaFrom(
                        wallets.user2.address,
                        utils.publicKeyToBytes32(solanaUser1ATA.toBase58()),
                        transferAmount
                    );
                    await tx.wait(RECEIPTS_COUNT);

                    const amountInATAAccountAfter = (await getAccount(connection, solanaUser1ATA)).amount;

                    const allowanceAfter = await ERC20ForSPL.allowance(wallets.user2.address, wallets.user1.address);
                    const user2BalanceAfter = await ERC20ForSPL.balanceOf(wallets.user2.address);
                    expect(allowance).to.be.greaterThan(allowanceAfter);
                    expect(allowance).to.eq(allowanceAfter + transferAmount);
                    expect(amountInATAAccountAfter).to.be.greaterThan(amountInATAAccount);
                    expect(amountInATAAccountAfter).to.eq(amountInATAAccount + transferAmount);
                    expect(user2Balance).to.be.greaterThan(user2BalanceAfter);
                    expect(user2Balance).to.eq(user2BalanceAfter + transferAmount);
                } else {
                    this.skip();
                }
            });
        });

        describe('Reverts',  function() {
            it('Malicious transfer - zero balance', async function () {
                if (grantedTestersWithBalance) {
                    // wallets.user3 has no tokens at all
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).transfer(wallets.user1.address, ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'ERC20InsufficientBalance'
                    );
                } else {
                    this.skip();
                }
            });

            it('approveSolana - approving zero Solana account', async function () {
                if (grantedTestersWithBalance) {
                    // wallets.user3 has no tokens at all
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).approveSolana('0x0000000000000000000000000000000000000000000000000000000000000000', ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'EmptyAccount'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('transferSolana - to empty account', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).transferSolana('0x0000000000000000000000000000000000000000000000000000000000000000', ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'EmptyAccount'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('transferSolana - sending amount greater than balance', async function () {
                if (grantedTestersWithBalance) {
                    const user1Balance = await ERC20ForSPL.balanceOf(wallets.user1);
                    await expect(
                        ERC20ForSPL.connect(wallets.user1).transferSolana(
                            await ERC20ForSPL.solanaAccount(wallets.user2.address),
                            user1Balance + ethers.parseUnits('1', TOKEN_MINT_DECIMALS)
                        )
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'ERC20InsufficientBalance'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('Malicious transferFrom - no approval given', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).transferFrom(wallets.user2.address, wallets.user3.address, ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'ERC20InsufficientAllowance'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('transferFrom - zero balance', async function () {
                if (grantedTestersWithBalance) {
                    let tx = await ERC20ForSPL.connect(wallets.user3).approve(wallets.user2.address, ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    await tx.wait(1);

                    await expect(
                        ERC20ForSPL.connect(wallets.user2).transferFrom(wallets.user3.address, wallets.user2.address, ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'ERC20InsufficientBalance'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('Malicious transferSolanaFrom - no approval given', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).transferSolanaFrom(wallets.user2.address, await ERC20ForSPL.solanaAccount(wallets.owner.address), ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'ERC20InsufficientAllowance'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('Malicious transferSolanaFrom - zero balance', async function () {
                if (grantedTestersWithBalance) {
                    let tx = await ERC20ForSPL.connect(wallets.user3).approve(wallets.user2.address, ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    await tx.wait(1);

                    await expect(
                        ERC20ForSPL.connect(wallets.user2).transferSolanaFrom(wallets.user3.address, await ERC20ForSPL.solanaAccount(wallets.owner.address), ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'ERC20InsufficientBalance'
                    );

                    // clear approval 
                    tx = await ERC20ForSPL.connect(wallets.user3).approve(wallets.user2.address, 0)
                    await tx.wait(1);
                } else {
                    this.skip();
                }
            });
    
            it('Malicious claim - no approval given', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).claim(
                            utils.publicKeyToBytes32(approverATAWithTokens),
                            ethers.parseUnits('100', TOKEN_MINT_DECIMALS)
                        )
                    ).to.be.reverted;
                } else {
                    this.skip();
                }
            });
    
            it('Malicious claimTo - no approval given', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).claimTo(
                            utils.publicKeyToBytes32(approverATAWithTokens),
                            wallets.user2.address,
                            ethers.parseUnits('100', TOKEN_MINT_DECIMALS)
                        )
                    ).to.be.reverted;
                } else {
                    this.skip();
                }
            });
    
            it('Malicious claim - claiming balance greater than approver balance', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).claim(
                            utils.publicKeyToBytes32(approverATAWithTokens),
                            '18446744073709551000' // almost max uint64, but for sure greater than approver balance
                        )
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'ERC20InsufficientBalance'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('Malicious burn - zero balance', async function () {
                if (grantedTestersWithBalance) {
                    // wallets.user3 has no tokens at all
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).burn(ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'ERC20InsufficientBalance'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('burnFrom - empty address', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ERC20ForSPL.connect(wallets.user3).burnFrom(ethers.ZeroAddress, ethers.parseUnits('1', TOKEN_MINT_DECIMALS))
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'ERC20InvalidSender'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('Transfer amount greater than max uint64', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ERC20ForSPL.connect(wallets.user1).transfer(wallets.user2.address, '18446744073709551616')
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'AmountExceedsUint64'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('Burn amount greater than max uint64', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ERC20ForSPL.connect(wallets.user1).burn('18446744073709551616')
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'AmountExceedsUint64'
                    );
                } else {
                    this.skip();
                }
            });
    
            it('Deploy with invalid Token Mint ', async function () {
                if (grantedTestersWithBalance) {
                    await expect(
                        ethers.deployContract(
                            'contracts/token/ERC20ForSpl/erc20_for_spl.sol:ERC20ForSpl',
                            ['0x7f2dcd2aa425a24abf0d8fe12b60aa8f4768370d0fd99c738aefe6f2150f03b8'],
                            wallets.owner
                        )
                    ).to.be.revertedWithCustomError(
                        ERC20ForSPL,
                        'InvalidTokenMint'
                    );
                } else {
                    this.skip();
                }
            });

            it('transfer empty address receiver', async function () {
                await expect(
                    ERC20ForSPL.connect(wallets.user2).transfer(ethers.ZeroAddress, ethers.parseUnits('10', TOKEN_MINT_DECIMALS))
                ).to.be.revertedWithCustomError(
                    ERC20ForSPL,
                    'ERC20InvalidReceiver'
                );
            });

            it('approve empty address spender', async function () {
                await expect(
                    ERC20ForSPL.connect(wallets.user2).approve(ethers.ZeroAddress, ethers.parseUnits('10', TOKEN_MINT_DECIMALS))
                ).to.be.revertedWithCustomError(
                    ERC20ForSPL,
                    'ERC20InvalidSpender'
                );
            });

            it('transferFrom empty address sender', async function () {
                await expect(
                    ERC20ForSPL.connect(wallets.user2).transferFrom(ethers.ZeroAddress, wallets.owner.address, ethers.parseUnits('10', TOKEN_MINT_DECIMALS))
                ).to.be.revertedWithCustomError(
                    ERC20ForSPL,
                    'ERC20InvalidSender'
                );
            });

            it('transferSolanaFrom empty address sender', async function () {
                await expect(
                    ERC20ForSPL.connect(wallets.user2).transferSolanaFrom(ethers.ZeroAddress, await ERC20ForSPL.solanaAccount(wallets.owner.address), ethers.parseUnits('10', TOKEN_MINT_DECIMALS))
                ).to.be.revertedWithCustomError(
                    ERC20ForSPL,
                    'ERC20InvalidSender'
                );
            });
        });

        describe('Scheduling transaction tests', async function () {
            it('Validate Solana users 1 & 2 have scheduled at least 1 tx ( to make (0xfF00000000000000000000000000000000000007).solanaAddress = true )', async function() {
                const randomAddress = ethers.Wallet.createRandom();
                const payer1 = utils.SolanaNativeHelper.getPayer(wallets.solanaUser1);
                const payer2 = utils.SolanaNativeHelper.getPayer(wallets.solanaUser2);

                let balanceBeforeTx = await connection.getBalance(wallets.solanaUser1.publicKey);
                let signature = await utils.SolanaNativeHelper.scheduleTransaction(
                    connection,
                    neon_getEvmParams,
                    wallets.solanaUser1, 
                    ERC20ForSPL.target, 
                    ERC20ForSPL.interface.encodeFunctionData("approve", [randomAddress.address, ethers.parseUnits('1', TOKEN_MINT_DECIMALS)])
                );
                console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                // wait scheduled tx to be processed
                await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser1.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                expect(await ERC20ForSPL.allowance(payer1, randomAddress.address)).to.be.greaterThan(0);

                balanceBeforeTx = await connection.getBalance(wallets.solanaUser2.publicKey);
                signature = await utils.SolanaNativeHelper.scheduleTransaction(
                    connection,
                    neon_getEvmParams,
                    wallets.solanaUser2, 
                    ERC20ForSPL.target, 
                    ERC20ForSPL.interface.encodeFunctionData("approve", [randomAddress.address, ethers.parseUnits('1', TOKEN_MINT_DECIMALS)])
                );
                console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                // wait scheduled tx to be processed
                await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser2.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                expect(await ERC20ForSPL.allowance(payer2, randomAddress.address)).to.be.greaterThan(0);
            });

            describe('Tests performed from Solana user with only ATA balance', async function () {
                it('Validate solanaUser1 has given ATA account approval to the ERC20ForSPL', async function () {
                    const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser1);

                    const solanaUser1TokenAta = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser1.publicKey,
                        false
                    );
                    const contractAccount = utils.calculateContractAccount(
                        ERC20ForSPL.target,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    const solanaUser1TokenAtaAccount = await getAccount(connection, solanaUser1TokenAta);

                    // Validate wallets.solanaUser1 have performed at least 1 scheduled transaction
                    // grant approval to the erc20forspl contract if needed
                    if (solanaUser1TokenAtaAccount.delegate == null || solanaUser1TokenAtaAccount.delegate.toBase58() != contractAccount.toBase58()) {
                        const transaction = new web3.Transaction();
                        transaction.add(createApproveInstruction(
                            solanaUser1TokenAta,
                            contractAccount,
                            wallets.solanaUser1.publicKey,
                            '18446744073709551615' // max uint64
                        ));
                        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                        transaction.sign(...[wallets.solanaUser1]);

                        const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
                        console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);

                        // wait scheduled tx to be processed
                        await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                    }

                    expect(await ERC20ForSPL.balanceOf(payer)).to.be.greaterThan(0);
                });

                it('validate balanceOf logic - only ATA balance should be increasing on token receive', async function () {
                    const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser1);
                    const payerInitialBalanceOf = await ERC20ForSPL.balanceOf(payer);
                    const payerInitialBalanceOfATA = await ERC20ForSPL.balanceOfATA(payer);

                    const solanaUser1ATA = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser1.publicKey,
                        false
                    );
                    const amountInATAAccount = (await getAccount(connection, solanaUser1ATA)).amount;
                    
                    const solanaUser1PDA = utils.calculatePdaAccount(
                        'ContractData',
                        ERC20ForSPL.target,
                        payer,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    expect(await connection.getAccountInfo(solanaUser1PDA)).to.eq(null);

                    expect(amountInATAAccount).to.be.greaterThan(0);
                    expect(payerInitialBalanceOf).to.eq(amountInATAAccount);

                    tx = await ERC20ForSPL.transfer(payer, ethers.parseUnits('10', TOKEN_MINT_DECIMALS));
                    await tx.wait(RECEIPTS_COUNT);

                    // make sure only PDA account balance has increased
                    const payerBalanceOfAfter = await ERC20ForSPL.balanceOf(payer);
                    const payerInitialBalanceOfATAAfter = await ERC20ForSPL.balanceOfATA(payer);
                    const amountInATAAccountAfter = (await getAccount(connection, solanaUser1ATA)).amount;
                    expect(payerBalanceOfAfter).to.be.greaterThan(payerInitialBalanceOf);
                    expect(payerInitialBalanceOfATAAfter).to.be.greaterThan(payerInitialBalanceOfATA);
                    expect(amountInATAAccountAfter).to.be.greaterThan(amountInATAAccount);
                    expect(payerBalanceOfAfter).to.eq(amountInATAAccountAfter);
                });

                it('solanaUser1 transfer tokens to user2', async function () {
                    if (grantedTestersWithBalance) {
                        const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser1);
                        const currentBalancePayer = await ERC20ForSPL.balanceOf(payer);
                        const currentBalanceUser2 = await ERC20ForSPL.balanceOf(wallets.user2.address);

                        const solanaUser1ATA = await getAssociatedTokenAddress(
                            new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                            wallets.solanaUser1.publicKey,
                            false
                        );
                        const amountInATAAccount = (await getAccount(connection, solanaUser1ATA)).amount;
                        
                        const solanaUser1PDA = utils.calculatePdaAccount(
                            'ContractData',
                            ERC20ForSPL.target,
                            payer,
                            new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                        )[0];
                        expect(await connection.getAccountInfo(solanaUser1PDA)).to.eq(null);

                        let balanceBeforeTx = await connection.getBalance(wallets.solanaUser1.publicKey);
                        let signature = await utils.SolanaNativeHelper.scheduleTransaction(
                            connection,
                            neon_getEvmParams,
                            wallets.solanaUser1,
                            ERC20ForSPL.target,
                            ERC20ForSPL.interface.encodeFunctionData("transfer", [wallets.user2.address, ethers.parseUnits('1', TOKEN_MINT_DECIMALS)])
                        );
                        console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                        // wait scheduled tx to be processed
                        await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                        console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser1.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                        const amountInATAAccountAfter = (await getAccount(connection, solanaUser1ATA)).amount;

                        expect(amountInATAAccount).to.be.greaterThan(amountInATAAccountAfter);
                        expect(currentBalancePayer).to.be.greaterThan(await ERC20ForSPL.balanceOf(payer));
                        expect(await ERC20ForSPL.balanceOf(wallets.user2.address)).to.be.greaterThan(currentBalanceUser2);
                    } else {
                        this.skip();
                    }
                }); 

                it('test approve & transferFrom from user2 to solanaUser1', async function () {
                    if (grantedTestersWithBalance) {
                        const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser1);

                        const solanaUser1ATA = await getAssociatedTokenAddress(
                            new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                            wallets.solanaUser1.publicKey,
                            false
                        );
                        const amountInATAAccount = (await getAccount(connection, solanaUser1ATA)).amount;
                        
                        const solanaUser1PDA = utils.calculatePdaAccount(
                            'ContractData',
                            ERC20ForSPL.target,
                            payer,
                            new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                        )[0];
                        expect(await connection.getAccountInfo(solanaUser1PDA)).to.eq(null);

                        const transferAmount = ethers.parseUnits('1', TOKEN_MINT_DECIMALS);
                        let tx = await ERC20ForSPL.connect(wallets.user2).approve(payer, transferAmount);
                        await tx.wait(RECEIPTS_COUNT);

                        expect( await ERC20ForSPL.allowance(wallets.user2.address, payer)).to.be.greaterThan(0);

                        const currentBalancePayer = await ERC20ForSPL.balanceOf(payer);
                        const currentBalancePayerATA = await ERC20ForSPL.balanceOfATA(payer);
                        const currentBalanceUser2 = await ERC20ForSPL.balanceOf(wallets.user2.address);

                        let balanceBeforeTx = await connection.getBalance(wallets.solanaUser1.publicKey);
                        let signature = await utils.SolanaNativeHelper.scheduleTransaction(
                            connection,
                            neon_getEvmParams,
                            wallets.solanaUser1,
                            ERC20ForSPL.target,
                            ERC20ForSPL.interface.encodeFunctionData("transferFrom", [wallets.user2.address, payer, transferAmount])
                        );
                        console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                        // wait scheduled tx to be processed
                        await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                        console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser1.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                        const amountInATAAccountAfter = (await getAccount(connection, solanaUser1ATA)).amount;

                        expect(amountInATAAccountAfter).to.be.greaterThan(amountInATAAccount);
                        expect(amountInATAAccountAfter).to.eq(amountInATAAccount + transferAmount);
                        expect(await ERC20ForSPL.balanceOf(payer)).to.be.greaterThan(currentBalancePayer);
                        expect(await ERC20ForSPL.balanceOfATA(payer)).to.be.greaterThan(currentBalancePayerATA);
                        expect(currentBalanceUser2).to.be.greaterThan(await ERC20ForSPL.balanceOf(wallets.user2.address));
                    } else {
                        this.skip();
                    }
                });

                it('test approve & transferFrom from solanaUser1 to MockVault smart contract', async function () {
                    if (grantedTestersWithBalance) {
                        const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser1);

                        const solanaUser1ATA = await getAssociatedTokenAddress(
                            new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                            wallets.solanaUser1.publicKey,
                            false
                        );
                        const amountInATAAccount = (await getAccount(connection, solanaUser1ATA)).amount;
                        
                        const solanaUser1PDA = utils.calculatePdaAccount(
                            'ContractData',
                            ERC20ForSPL.target,
                            payer,
                            new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                        )[0];
                        expect(await connection.getAccountInfo(solanaUser1PDA)).to.eq(null);

                        const transferAmount = ethers.parseUnits('1', TOKEN_MINT_DECIMALS);

                        let balanceBeforeTx = await connection.getBalance(wallets.solanaUser1.publicKey);
                        let signature = await utils.SolanaNativeHelper.scheduleTransaction(
                            connection,
                            neon_getEvmParams,
                            wallets.solanaUser1,
                            ERC20ForSPL.target,
                            ERC20ForSPL.interface.encodeFunctionData("approve", [MockVault.target, transferAmount])
                        );
                        console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                        // wait scheduled tx to be processed
                        await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                        console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser1.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                        expect(await ERC20ForSPL.allowance(payer, MockVault.target)).to.eq(transferAmount);

                        const currentBalancePayer = await ERC20ForSPL.balanceOf(payer);
                        const currentBalancePayerATA = await ERC20ForSPL.balanceOfATA(payer);
                        const currentBalanceMockVault = await ERC20ForSPL.balanceOf(MockVault.target);

                        balanceBeforeTx = await connection.getBalance(wallets.solanaUser1.publicKey);
                        signature = await utils.SolanaNativeHelper.scheduleTransaction(
                            connection,
                            neon_getEvmParams,
                            wallets.solanaUser1,
                            MockVault.target,
                            MockVault.interface.encodeFunctionData("deposit", [transferAmount])
                        );
                        console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                        // wait scheduled tx to be processed
                        await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                        console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser1.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                        const amountInATAAccountAfter = (await getAccount(connection, solanaUser1ATA)).amount;

                        expect(amountInATAAccount).to.be.greaterThan(amountInATAAccountAfter);
                        expect(amountInATAAccount).to.eq(amountInATAAccountAfter + transferAmount);
                        expect(currentBalancePayer).to.be.greaterThan(await ERC20ForSPL.balanceOf(payer));
                        expect(currentBalancePayerATA).to.be.greaterThan(await ERC20ForSPL.balanceOfATA(payer));
                        expect(currentBalancePayer).to.eq(await ERC20ForSPL.balanceOf(payer) + transferAmount);
                        expect(await ERC20ForSPL.balanceOf(MockVault.target)).to.be.greaterThan(currentBalanceMockVault);
                        expect(await ERC20ForSPL.balanceOf(MockVault.target)).to.eq(currentBalanceMockVault + transferAmount);
                    } else {
                        this.skip();
                    }
                });
            });

            describe('Tests performed from Solana user with both ATA & PDA balance', async function () {
                it('Validate solanaUser2 has given ATA account approval to the ERC20ForSPL', async function () {
                    const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser2);

                    const solanaUser2TokenAta = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser2.publicKey,
                        false
                    );
                    const contractAccount = utils.calculateContractAccount(
                        ERC20ForSPL.target,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    const solanaUser2TokenAtaAccount = await getAccount(connection, solanaUser2TokenAta);

                    // Validate wallets.solanaUser1 have performed at least 1 scheduled transaction
                    // grant approval to the erc20forspl contract if needed
                    if (solanaUser2TokenAtaAccount.delegate == null || solanaUser2TokenAtaAccount.delegate.toBase58() != contractAccount.toBase58()) {
                        const transaction = new web3.Transaction();
                        transaction.add(createApproveInstruction(
                            solanaUser2TokenAta,
                            contractAccount,
                            wallets.solanaUser2.publicKey,
                            '18446744073709551615' // max uint64
                        ));
                        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                        transaction.sign(...[wallets.solanaUser2]);

                        const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
                        console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);

                        // wait scheduled tx to be processed
                        await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                    }

                    expect(await ERC20ForSPL.balanceOf(payer)).to.be.greaterThan(0);
                });

                it('validate balanceOf logic - only ATA balance should be increasing on token receive', async function () {
                    const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser2);
                    const payerInitialBalanceOf = await ERC20ForSPL.balanceOf(payer);

                    const solanaUser2ATA = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser2.publicKey,
                        false
                    );
                    const amountInATAAccount = (await getAccount(connection, solanaUser2ATA)).amount;
                    
                    const solanaUser2PDA = utils.calculatePdaAccount(
                        'ContractData',
                        ERC20ForSPL.target,
                        payer,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    const amountInPDAAccount = (await getAccount(connection, solanaUser2PDA)).amount;
                    if (amountInPDAAccount == 0) {
                        this.skip();
                    }

                    expect(amountInPDAAccount).to.be.greaterThan(0);
                    expect(amountInATAAccount).to.be.greaterThan(0);
                    expect(payerInitialBalanceOf).to.eq(amountInATAAccount + amountInPDAAccount);

                    tx = await ERC20ForSPL.transfer(payer, ethers.parseUnits('10', TOKEN_MINT_DECIMALS));
                    await tx.wait(RECEIPTS_COUNT);

                    // make sure only PDA account balance has increased
                    const payerBalanceOfAfter = await ERC20ForSPL.balanceOf(payer);
                    const amountInATAAccountAfter = (await getAccount(connection, solanaUser2ATA)).amount;
                    const amountInPDAAccountAfter = (await getAccount(connection, solanaUser2PDA)).amount;
                    expect(payerBalanceOfAfter).to.be.greaterThan(payerInitialBalanceOf);
                    expect(amountInATAAccountAfter).to.be.greaterThan(amountInATAAccount);
                    expect(amountInPDAAccountAfter).to.eq(amountInPDAAccount);
                    expect(payerBalanceOfAfter).to.eq(amountInATAAccountAfter + amountInPDAAccountAfter);
                });

                it('transfer part of the PDA balance to owner', async function () {
                    const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser2);
                    const payerInitialBalanceOf = await ERC20ForSPL.balanceOf(payer);
                    const ownerInitialBalanceOf = await ERC20ForSPL.balanceOf(wallets.owner.address);

                    const solanaUser2ATA = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser2.publicKey,
                        false
                    );
                    const amountInATAAccount = (await getAccount(connection, solanaUser2ATA)).amount;
                    
                    const solanaUser2PDA = utils.calculatePdaAccount(
                        'ContractData',
                        ERC20ForSPL.target,
                        payer,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    const amountInPDAAccount = (await getAccount(connection, solanaUser2PDA)).amount;
                    if (amountInPDAAccount == 0) {
                        this.skip();
                    }

                    const transferAmount = amountInPDAAccount - (amountInPDAAccount / 2n);

                    let balanceBeforeTx = await connection.getBalance(wallets.solanaUser2.publicKey);
                    let signature = await utils.SolanaNativeHelper.scheduleTransaction(
                        connection,
                        neon_getEvmParams,
                        wallets.solanaUser2,
                        ERC20ForSPL.target,
                        ERC20ForSPL.interface.encodeFunctionData("transfer", [wallets.owner.address, transferAmount])
                    );
                    console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                    // wait scheduled tx to be processed
                    await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                    console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser2.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                    const payerBalanceOfAfter = await ERC20ForSPL.balanceOf(payer);
                    const ownerBalanceOfAfter = await ERC20ForSPL.balanceOf(wallets.owner.address);
                    const amountInATAAccountAfter = (await getAccount(connection, solanaUser2ATA)).amount;
                    const amountInPDAAccountAfter = (await getAccount(connection, solanaUser2PDA)).amount;

                    expect(payerInitialBalanceOf).to.be.greaterThan(payerBalanceOfAfter);
                    expect(ownerBalanceOfAfter).to.be.greaterThan(ownerInitialBalanceOf);
                    expect(amountInATAAccount).to.eq(amountInATAAccountAfter);
                    expect(amountInPDAAccount).to.be.greaterThan(amountInPDAAccountAfter);
                    expect(amountInPDAAccount).to.eq(amountInPDAAccountAfter + transferAmount);
                });

                it('transferFrom all of the PDA balance and part of the ATA balance to MockVault smart contract', async function () {
                    const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser2);
                    const payerInitialBalanceOf = await ERC20ForSPL.balanceOf(payer);
                    const mockVaultInitialBalanceOf = await ERC20ForSPL.balanceOf(MockVault.target);

                    const solanaUser2ATA = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser2.publicKey,
                        false
                    );
                    const amountInATAAccount = (await getAccount(connection, solanaUser2ATA)).amount;
                    
                    const solanaUser2PDA = utils.calculatePdaAccount(
                        'ContractData',
                        ERC20ForSPL.target,
                        payer,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    const amountInPDAAccount = (await getAccount(connection, solanaUser2PDA)).amount;
                    if (amountInPDAAccount == 0) {
                        this.skip();
                    }

                    // spend full PDA balance plus 1 unit of the ATA balance
                    const transferAmount = amountInPDAAccount + ethers.parseUnits('1', TOKEN_MINT_DECIMALS);

                    let balanceBeforeTx = await connection.getBalance(wallets.solanaUser2.publicKey);
                    let signature = await utils.SolanaNativeHelper.scheduleTransaction(
                        connection,
                        neon_getEvmParams,
                        wallets.solanaUser2,
                        ERC20ForSPL.target,
                        ERC20ForSPL.interface.encodeFunctionData("approve", [MockVault.target, transferAmount])
                    );
                    console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                    // wait scheduled tx to be processed
                    await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                    console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser2.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                    expect(await ERC20ForSPL.allowance(payer, MockVault.target)).to.eq(transferAmount);

                    balanceBeforeTx = await connection.getBalance(wallets.solanaUser2.publicKey);
                    signature = await utils.SolanaNativeHelper.scheduleTransaction(
                        connection,
                        neon_getEvmParams,
                        wallets.solanaUser2,
                        MockVault.target,
                        MockVault.interface.encodeFunctionData("deposit", [transferAmount])
                    );
                    console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                    // wait scheduled tx to be processed
                    await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                    console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser2.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                    const payerBalanceOfAfter = await ERC20ForSPL.balanceOf(payer);
                    const mockVaultBalanceOfAfter = await ERC20ForSPL.balanceOf(MockVault.target);
                    const amountInATAAccountAfter = (await getAccount(connection, solanaUser2ATA)).amount;
                    const amountInPDAAccountAfter = (await getAccount(connection, solanaUser2PDA)).amount;

                    expect(payerInitialBalanceOf).to.be.greaterThan(payerBalanceOfAfter);
                    expect(mockVaultBalanceOfAfter).to.be.greaterThan(mockVaultInitialBalanceOf);
                    expect(amountInATAAccount).to.be.greaterThan(amountInATAAccountAfter);
                    expect(amountInATAAccountAfter).to.eq(amountInATAAccount + amountInPDAAccount - transferAmount);
                    expect(amountInPDAAccountAfter).to.eq(0);
                    expect(amountInPDAAccount).to.be.greaterThan(amountInPDAAccountAfter);
                });
            });

            describe('Tests performed from Solana user with only PDA balance', async function () {
                it('validate balanceOf logic - only PDA balance should be increasing on token receive', async function () {
                    const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser3);
                    const payerInitialBalanceOf = await ERC20ForSPL.balanceOf(payer);
                    const payerInitialBalanceOfPDA = await ERC20ForSPL.balanceOfPDA(payer);

                    const solanaUser3ATA = await getAssociatedTokenAddress(
                        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                        wallets.solanaUser3.publicKey,
                        false
                    );
                    
                    const solanaUser3PDA = utils.calculatePdaAccount(
                        'ContractData',
                        ERC20ForSPL.target,
                        payer,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    const amountInPDAAccount = (await getAccount(connection, solanaUser3PDA)).amount;

                    // make sure wallets.solanaUser3 doesn't have ATA account initialized
                    expect(await connection.getAccountInfo(solanaUser3ATA)).to.eq(null);
                    expect(amountInPDAAccount).to.be.greaterThan(0);
                    expect(payerInitialBalanceOf).to.eq(amountInPDAAccount);

                    tx = await ERC20ForSPL.transfer(payer, ethers.parseUnits('10', TOKEN_MINT_DECIMALS));
                    await tx.wait(RECEIPTS_COUNT);

                    // make sure only PDA account balance has increased
                    const payerBalanceOfAfter = await ERC20ForSPL.balanceOf(payer);
                    const payerBalanceOfPDAAfter = await ERC20ForSPL.balanceOf(payer);
                    const amountInPDAAccountAfter = (await getAccount(connection, solanaUser3PDA)).amount;
                    expect(payerBalanceOfAfter).to.be.greaterThan(payerInitialBalanceOf);
                    expect(payerBalanceOfPDAAfter).to.be.greaterThan(payerInitialBalanceOfPDA);
                    expect(amountInPDAAccountAfter).to.be.greaterThan(amountInPDAAccount);
                    expect(payerBalanceOfAfter).to.eq(amountInPDAAccountAfter);
                });

                it('transfer part of the PDA balance to owner', async function () {
                    const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser3);
                    const payerInitialBalanceOf = await ERC20ForSPL.balanceOf(payer);
                    const payerInitialBalanceOfPDA = await ERC20ForSPL.balanceOfPDA(payer);
                    const ownerInitialBalanceOf = await ERC20ForSPL.balanceOf(wallets.owner.address);
                    
                    const solanaUser3PDA = utils.calculatePdaAccount(
                        'ContractData',
                        ERC20ForSPL.target,
                        payer,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    const amountInPDAAccount = (await getAccount(connection, solanaUser3PDA)).amount;

                    const transferAmount = amountInPDAAccount - (amountInPDAAccount / 2n);

                    let balanceBeforeTx = await connection.getBalance(wallets.solanaUser3.publicKey);
                    let signature = await utils.SolanaNativeHelper.scheduleTransaction(
                        connection,
                        neon_getEvmParams,
                        wallets.solanaUser3,
                        ERC20ForSPL.target,
                        ERC20ForSPL.interface.encodeFunctionData("transfer", [wallets.owner.address, transferAmount])
                    );
                    console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                    // wait scheduled tx to be processed
                    await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                    console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser3.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                    const payerBalanceOfAfter = await ERC20ForSPL.balanceOf(payer);
                    const payerInitialBalanceOfPDAAfter = await ERC20ForSPL.balanceOfPDA(payer);
                    const ownerBalanceOfAfter = await ERC20ForSPL.balanceOf(wallets.owner.address);
                    const amountInPDAAccountAfter = (await getAccount(connection, solanaUser3PDA)).amount;

                    expect(payerInitialBalanceOf).to.be.greaterThan(payerBalanceOfAfter);
                    expect(payerInitialBalanceOfPDA).to.be.greaterThan(payerInitialBalanceOfPDAAfter);
                    expect(ownerBalanceOfAfter).to.be.greaterThan(ownerInitialBalanceOf);
                    expect(amountInPDAAccount).to.be.greaterThan(amountInPDAAccountAfter);
                    expect(amountInPDAAccount).to.eq(amountInPDAAccountAfter + transferAmount);
                });

                it('transferFrom all of the PDA balance to MockVault smart contract', async function () {
                    const payer = utils.SolanaNativeHelper.getPayer(wallets.solanaUser3);
                    const payerInitialBalanceOf = await ERC20ForSPL.balanceOf(payer);
                    const payerInitialBalanceOfPDA = await ERC20ForSPL.balanceOfPDA(payer);
                    const mockVaultInitialBalanceOf = await ERC20ForSPL.balanceOf(MockVault.target);
                    
                    const solanaUser3PDA = utils.calculatePdaAccount(
                        'ContractData',
                        ERC20ForSPL.target,
                        payer,
                        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
                    )[0];
                    const amountInPDAAccount = (await getAccount(connection, solanaUser3PDA)).amount;

                    const transferAmount = amountInPDAAccount - (amountInPDAAccount / 2n);

                    let balanceBeforeTx = await connection.getBalance(wallets.solanaUser3.publicKey);
                    let signature = await utils.SolanaNativeHelper.scheduleTransaction(
                        connection,
                        neon_getEvmParams,
                        wallets.solanaUser3,
                        ERC20ForSPL.target,
                        ERC20ForSPL.interface.encodeFunctionData("approve", [MockVault.target, transferAmount])
                    );
                    console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                    // wait scheduled tx to be processed
                    await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                    console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser3.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                    expect(await ERC20ForSPL.allowance(payer, MockVault.target)).to.eq(transferAmount);

                    balanceBeforeTx = await connection.getBalance(wallets.solanaUser3.publicKey);
                    signature = await utils.SolanaNativeHelper.scheduleTransaction(
                        connection,
                        neon_getEvmParams,
                        wallets.solanaUser3,
                        MockVault.target,
                        MockVault.interface.encodeFunctionData("deposit", [transferAmount])
                    );
                    console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
                    // wait scheduled tx to be processed
                    await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
                    console.log('Paid -', (balanceBeforeTx - await connection.getBalance(wallets.solanaUser3.publicKey)) / 10 ** TOKEN_MINT_DECIMALS, 'SOLs', '\n');

                    const payerBalanceOfAfter = await ERC20ForSPL.balanceOf(payer);
                    const payerInitialBalanceOfPDAAfter = await ERC20ForSPL.balanceOfPDA(payer);
                    const mockVaultBalanceOfAfter = await ERC20ForSPL.balanceOf(MockVault.target);
                    const amountInPDAAccountAfter = (await getAccount(connection, solanaUser3PDA)).amount;

                    expect(payerInitialBalanceOf).to.be.greaterThan(payerBalanceOfAfter);
                    expect(payerInitialBalanceOfPDA).to.be.greaterThan(payerInitialBalanceOfPDAAfter);
                    expect(mockVaultBalanceOfAfter).to.be.greaterThan(mockVaultInitialBalanceOf);
                    expect(amountInPDAAccount).to.be.greaterThan(amountInPDAAccountAfter);
                    expect(amountInPDAAccount).to.eq(amountInPDAAccountAfter + transferAmount);
                });
            });
        });
    });
});

async function setupTesters() {
    console.log('\n============================= setupTesters =============================\n');

    // airdrop NEONs to evmUsers
    await utils.airdropNEON(wallets.user1.address);
    await utils.airdropNEON(wallets.user2.address);
    await utils.airdropNEON(wallets.user3.address);

    // airdrop SOLs to svmUsers
    await utils.airdropSOL(wallets.solanaUser2);
    await utils.airdropSOL(wallets.solanaUser3);
    await utils.airdropSOL(wallets.solanaUser4);

    // send NEONs to evmUsers
    const solanaUser4TokenAta = await getAssociatedTokenAddress(
        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
        wallets.solanaUser4.publicKey,
        false
    );
    approverATAWithTokens = solanaUser4TokenAta.toBase58();
    console.log(approverATAWithTokens, 'approverATAWithTokens');

    if ((await getAccount(connection, solanaUser4TokenAta)).delegate == null) {
        console.log('\nGranting approval wallets.owner to spend wallets.solanaUser4\'s tokens through claim & claimTo:');
        const delegatedPdaOwner = utils.calculatePdaAccount(
            'AUTH',
            ERC20ForSPL.target,
            wallets.owner.address,
            new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
        );
    
        const transaction = new web3.Transaction();
        transaction.add(
            createApproveInstruction(
                solanaUser4TokenAta,
                delegatedPdaOwner[0],
                wallets.solanaUser4.publicKey,
                '18446744073709551615' // max uint64
            )
        );

        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        transaction.sign(...[wallets.solanaUser4]);

        const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
        console.log(`https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);
        
        // wait scheduled tx to be processed
        await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
    }

    let tx = await ERC20ForSPL.connect(wallets.owner).claim(
        utils.publicKeyToBytes32(approverATAWithTokens),
        ethers.parseUnits('1000', TOKEN_MINT_DECIMALS)
    );
    await tx.wait(RECEIPTS_COUNT);
    console.log('Sent NEONs to', wallets.owner.address);

    // send tokens to user 1 & 2
    tx = await ERC20ForSPL.transfer(wallets.user1.address, ethers.parseUnits('10', TOKEN_MINT_DECIMALS));
    await tx.wait(RECEIPTS_COUNT);
    console.log('Sent NEONs to', wallets.user1.address);

    tx = await ERC20ForSPL.transfer(wallets.user2.address, ethers.parseUnits('10', TOKEN_MINT_DECIMALS));
    await tx.wait(RECEIPTS_COUNT);
    console.log('Sent NEONs to', wallets.user2.address);

    // send NEONs to EVM addresses of Solana users before they scheduled their first tx or before they initialized their ATA's
    const payer2 = utils.SolanaNativeHelper.getPayer(wallets.solanaUser2);
    const payer3 = utils.SolanaNativeHelper.getPayer(wallets.solanaUser3);

    tx = await ERC20ForSPL.transfer(payer2, ethers.parseUnits('50', TOKEN_MINT_DECIMALS));
    await tx.wait(RECEIPTS_COUNT);
    console.log('Sent NEONs to', payer2);

    tx = await ERC20ForSPL.transfer(payer3, ethers.parseUnits('50', TOKEN_MINT_DECIMALS));
    await tx.wait(RECEIPTS_COUNT);
    console.log('Sent NEONs to', payer3);

    const solanaUser2ATA = await getAssociatedTokenAddress(
        new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
        wallets.solanaUser2.publicKey,
        false
    );
    const ataInfo = await connection.getAccountInfo(solanaUser2ATA);

    // create wallets.solanaUser2 ATA only if it's missing
    if (!ataInfo || !ataInfo.data) {
        const transaction = new web3.Transaction();
        transaction.add(
            createAssociatedTokenAccountInstruction(
                wallets.solanaUser1.publicKey,
                solanaUser2ATA,
                wallets.solanaUser2.publicKey,
                new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network])
            ),
            createMintToInstruction(
                new web3.PublicKey(config.token.ERC20ForSplTokenMint[globalOptions.network]),
                solanaUser2ATA,
                wallets.solanaUser1.publicKey,
                1000 * 10 ** 9 // mint 1000 tokens
            )
        );
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        transaction.sign(...[wallets.solanaUser1]);

        const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
        console.log(`\nhttps://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${config.svm_node[globalOptions.network]}`);

        // wait scheduled tx to be processed
        await utils.asyncTimeout(SOLANA_TX_TIMEOUT);
    }
}