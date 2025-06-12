import { network, globalOptions } from "hardhat"
import { expect } from "chai"
import { getSecrets } from "../../neon-secrets.js";
import utils from './utils.js'
import config from '../config.js'
import "dotenv/config"

const ERC20ForSPLFactoryAddress = config.token.ERC20ForSplFactory[globalOptions.network];
const TOKEN_MINT = utils.publicKeyToBytes32(config.token.ERC20ForSplTokenMint[globalOptions.network]);
const RECEIPTS_COUNT = 1;

let ethers;
let owner;
let tx;
let ERC20ForSPLFactory;
let ERC20ForSPL;
let ERC20ForSPLMintable;
let ERC20ForSplContractFactory;
let ERC20ForSplMintableContractFactory;

describe('Test init', async function () {
    before(async function() {
        const { wallets } = await getSecrets()
        ethers = (await network.connect()).ethers
        owner = wallets.owner

        if (await ethers.provider.getBalance(owner.address) == 0) {
            await utils.airdropNEON(owner.address);
        }

        const ERC20ForSplFactoryContractFactory = await ethers.getContractFactory('contracts/token/ERC20ForSpl/erc20_for_spl_factory.sol:ERC20ForSplFactory', owner);
        ERC20ForSplContractFactory = await ethers.getContractFactory('contracts/token/ERC20ForSpl/erc20_for_spl.sol:ERC20ForSpl', owner);
        ERC20ForSplMintableContractFactory = await ethers.getContractFactory('contracts/token/ERC20ForSpl/erc20_for_spl.sol:ERC20ForSplMintable', owner);
        
        if (ethers.isAddress(ERC20ForSPLFactoryAddress)) {
            console.log('\nCreating instance of already deployed ERC20ForSPLFactory contract on Neon EVM with address', "\x1b[32m", ERC20ForSPLFactoryAddress, "\x1b[30m", '\n');
            ERC20ForSPLFactory = ERC20ForSplFactoryContractFactory.attach(ERC20ForSPLFactoryAddress);
        } else {
            // deploy ERC20ForSPLFactory
            ERC20ForSPLFactory = await ethers.deployContract('contracts/token/ERC20ForSpl/erc20_for_spl_factory.sol:ERC20ForSplFactory', owner);
            await ERC20ForSPLFactory.waitForDeployment();
            console.log('\nCreating instance of just now deployed ERC20ForSplFactory contract on Neon EVM with address', "\x1b[32m", ERC20ForSPLFactory.target, "\x1b[30m", '\n'); 
        }
    });

    describe('ERC20ForSPL tests', function() {
        it('createErc20ForSpl', async function () {
            if (TOKEN_MINT == '0x0000000000000000000000000000000000000000000000000000000000000000') {
                this.skip();
            }

            tx = await ERC20ForSPLFactory.createErc20ForSpl(TOKEN_MINT);
            await tx.wait(RECEIPTS_COUNT);

            const getErc20ForSpl = await ERC20ForSPLFactory.getErc20ForSpl(TOKEN_MINT);
            expect(getErc20ForSpl).to.not.eq(ethers.ZeroAddress);
            expect(TOKEN_MINT).to.eq(await ERC20ForSPLFactory.getTokenMintByAddress(getErc20ForSpl));
            expect(await ethers.provider.getCode(getErc20ForSpl)).to.not.eq('0x');

            ERC20ForSPL = ERC20ForSplContractFactory.attach(getErc20ForSpl);
        });

        it('createErc20ForSplMintable', async function () {
            tx = await ERC20ForSPLFactory.createErc20ForSplMintable(
                "Test",
                "TESTCOIN",
                9,
                owner.address
            );
            let receipt = await tx.wait(RECEIPTS_COUNT);

            let tokenMint;
            for (let i = 0, len = receipt.logs.length; i < len; ++i) {
                if (receipt.logs[i].fragment != undefined && receipt.logs[i].fragment.name == 'ERC20ForSplCreated') {
                    tokenMint = receipt.logs[i].args[0];
                    break;
                }
            }

            const getErc20ForSplMintable = await ERC20ForSPLFactory.allErc20ForSpl(
                parseInt((await ERC20ForSPLFactory.allErc20ForSplLength()).toString()) - 1
            );
            expect(getErc20ForSplMintable).to.not.eq(ethers.ZeroAddress);
            expect(tokenMint).to.eq(await ERC20ForSPLFactory.getTokenMintByAddress(getErc20ForSplMintable));
            expect(await ethers.provider.getCode(getErc20ForSplMintable)).to.not.eq('0x');


            ERC20ForSPLMintable = ERC20ForSplMintableContractFactory.attach(getErc20ForSplMintable);
        });

        it('allErc20ForSplLength', async function () {
            expect(await ERC20ForSPLFactory.allErc20ForSplLength()).to.eq(2);
        });
        
        describe('Reverts',  function() {
            it('ERC20ForSplAlreadyExists', async function () {
                await expect(
                    ERC20ForSPLFactory.createErc20ForSpl(TOKEN_MINT)
                ).to.be.revertedWithCustomError(
                    ERC20ForSPLFactory,
                    'ERC20ForSplAlreadyExists'
                );
            });

            it('ERC20ForSplNotCreated', async function () {
                await expect(
                    ERC20ForSPLFactory.createErc20ForSpl("0x0000000000000000000000000000000000000000000000000000000000000001")
                ).to.be.revertedWithCustomError(
                    ERC20ForSPLFactory,
                    'ERC20ForSplNotCreated'
                );
            });
            
            it('ERC20ForSplMintableNotCreated', async function () {
                await expect(
                    ERC20ForSPLFactory.createErc20ForSplMintable(
                        "Test",
                        "TESTCOIN",
                        9,
                        ethers.ZeroAddress
                    )
                ).to.be.revertedWithCustomError(
                    ERC20ForSPLFactory,
                    'ERC20ForSplMintableNotCreated'
                );
            });
        });
    });
});