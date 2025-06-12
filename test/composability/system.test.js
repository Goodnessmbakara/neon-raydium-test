import { network, globalOptions } from "hardhat"
import * as _ethers from "ethers"
import { expect } from "chai"
import web3 from "@solana/web3.js"
import { getAccount, TOKEN_PROGRAM_ID, ACCOUNT_SIZE } from "@solana/spl-token"
import { deployContract, airdropSOL } from "./utils.js"
import config from "../config.js"
import { getSecrets } from "../../neon-secrets.js";

describe('\u{1F680} \x1b[36mSystem program composability tests\x1b[33m',  async function() {

    console.log("\nNetwork name: " + globalOptions.network)

    const ZERO_AMOUNT = BigInt(0)
    const AMOUNT = _ethers.parseUnits('1', 9)
    const ZERO_BYTES32 = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')

    let ethers,
        solanaConnection,
        deployer,
        neonEVMUser,
        callSystemProgram,
        mockCallSystemProgram,
        tx,
        seed,
        basePubKey,
        rentExemptBalance,
        createWithSeedAccountInBytes,
        info,
        initialRecipientSOLBalance,
        newRecipientSOLBalance

    before(async function() {
        const { wallets } = await getSecrets()
        ethers = (await network.connect()).ethers
        solanaConnection = new web3.Connection(config.svm_node[globalOptions.network], "processed")
        const deployment = await deployContract(wallets.owner, wallets.user1, 'CallSystemProgram', null)
        deployer = deployment.deployer
        neonEVMUser = deployment.user
        callSystemProgram = deployment.contract
        mockCallSystemProgram = (await deployContract(wallets.owner, wallets.user1, 'MockCallSystemProgram', null)).contract

        basePubKey = await callSystemProgram.getNeonAddress(callSystemProgram.target)
        rentExemptBalance = await solanaConnection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE)
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s System program \x1b[36mcreateAccountWithSeed\x1b[33m instruction\x1b[0m', function() {

        it('Create account with seed', async function() {
            // Generate the public key of the account we want to create from a seed and the id of the program it will
            // be assigned to
            seed = 'seed' + Date.now().toString()
            createWithSeedAccountInBytes = await callSystemProgram.getCreateWithSeedAccount(
                basePubKey,
                TOKEN_PROGRAM_ID.toBuffer(),
                Buffer.from(seed)
            )

            // Assign the account to the specified program, allocate space to it and fund it
            tx = await callSystemProgram.createAccountWithSeed(
                TOKEN_PROGRAM_ID.toBuffer(), // SPL token program
                Buffer.from(seed),
                ACCOUNT_SIZE // SPL token account data size
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await solanaConnection.getAccountInfo(new web3.PublicKey(ethers.encodeBase58(createWithSeedAccountInBytes)))
            expect(info.owner.toBase58()).to.eq(TOKEN_PROGRAM_ID.toBase58())
            expect(info.executable).to.be.false
            expect(info.lamports).to.eq(rentExemptBalance)
            expect(info.space).to.eq(ACCOUNT_SIZE)

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(createWithSeedAccountInBytes)))
            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(createWithSeedAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(ZERO_BYTES32))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(ZERO_BYTES32))
            expect(info.delegate).to.eq(null)
            expect(info.closeAuthority).to.eq(null)
            expect(info.amount).to.eq(ZERO_AMOUNT)
            expect(info.delegatedAmount).to.eq(ZERO_AMOUNT)
            expect(info.isInitialized).to.eq(false)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.eq(null)
            expect(info.tlvData.length).to.eq(0)
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s System program \x1b[36mtransfer\x1b[33m instruction\x1b[0m', function() {

        it('Transfer SOL', async function() {
            // Generate a random key pair
            const recipient = web3.Keypair.generate()
            initialRecipientSOLBalance = await solanaConnection.getBalance(recipient.publicKey)

            // Transfer SOL to the recipient account
            tx = await callSystemProgram.transfer(
                recipient.publicKey.toBuffer(), // Transfer recipient public key
                AMOUNT // Amount of SOL to transfer
            )
            await tx.wait(1) // Wait for 1 confirmation

            newRecipientSOLBalance = await solanaConnection.getBalance(recipient.publicKey)
            expect(newRecipientSOLBalance - initialRecipientSOLBalance).to.eq(AMOUNT)
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s System program \x1b[36massignWithSeed\x1b[33m instruction\x1b[0m', function() {

        it('Assign an account to the Token program', async function() {
            // Generate a new account public key from a seed and the id of the program we want to assign that account to
            seed = 'assign' + Date.now().toString()
            createWithSeedAccountInBytes = await callSystemProgram.getCreateWithSeedAccount(
                basePubKey,
                TOKEN_PROGRAM_ID.toBuffer(),
                Buffer.from(seed)
            )

            // Fund the account to be able to get account info
            await airdropSOL(new web3.PublicKey(ethers.encodeBase58(createWithSeedAccountInBytes)), rentExemptBalance)

            info = await solanaConnection.getAccountInfo(new web3.PublicKey(ethers.encodeBase58(createWithSeedAccountInBytes)))
            expect(info.owner.toBase58()).to.eq(web3.SystemProgram.programId.toBase58()) // Account belongs to System program initially
            expect(info.executable).to.be.false
            expect(info.lamports).to.eq(rentExemptBalance)
            expect(info.space).to.eq(0)

            // Assign the account to the specified program
            tx = await callSystemProgram.assign(
                TOKEN_PROGRAM_ID.toBuffer(),
                Buffer.from(seed)
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await solanaConnection.getAccountInfo(new web3.PublicKey(ethers.encodeBase58(createWithSeedAccountInBytes)))
            expect(info.owner.toBase58()).to.eq(TOKEN_PROGRAM_ID.toBase58()) // Account has been assigned to Token program
            expect(info.executable).to.be.false
            expect(info.lamports).to.eq(rentExemptBalance)
            expect(info.space).to.eq(0)
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s System program \x1b[36mallocateWithSeed\x1b[33m instruction\x1b[0m', function() {

        it('Allocate storage space to an account', async function() {
            // Generate a new account public key from a seed and program id
            seed = 'allocate' + Date.now().toString()
            createWithSeedAccountInBytes = await callSystemProgram.getCreateWithSeedAccount(
                basePubKey,
                TOKEN_PROGRAM_ID.toBuffer(),
                Buffer.from(seed)
            )

            // Fund the account to be able to get account info
            await airdropSOL(new web3.PublicKey(ethers.encodeBase58(createWithSeedAccountInBytes)), parseInt(rentExemptBalance.toString()))

            info = await solanaConnection.getAccountInfo(new web3.PublicKey(ethers.encodeBase58(createWithSeedAccountInBytes)))
            expect(info.owner.toBase58()).to.eq(web3.SystemProgram.programId.toBase58()) // Account belongs to System program
            expect(info.executable).to.be.false
            expect(info.lamports).to.eq(rentExemptBalance)
            expect(info.space).to.eq(0)

            // Allocate storage space to the account
            tx = await callSystemProgram.allocate(
                TOKEN_PROGRAM_ID.toBuffer(),
                Buffer.from(seed),
                ACCOUNT_SIZE
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await solanaConnection.getAccountInfo(new web3.PublicKey(ethers.encodeBase58(createWithSeedAccountInBytes)))
            expect(info.owner.toBase58()).to.eq(TOKEN_PROGRAM_ID.toBase58()) // Account has been assigned to Token program
            expect(info.executable).to.be.false
            expect(info.lamports).to.eq(rentExemptBalance)
            expect(info.space).to.eq(ACCOUNT_SIZE) // Storage space has been allocated to the account
        })
    })

    describe('\n\u{231B} \x1b[33m Testing Solana\'s System program \x1b[36mdata getters\x1b[33m\x1b[0m', async function() {

        it('Call account data getters', async function() {
            info = await solanaConnection.getAccountInfo(new web3.PublicKey(ethers.encodeBase58(createWithSeedAccountInBytes)))
            const balance = await callSystemProgram.getBalance(createWithSeedAccountInBytes)
            const owner = await callSystemProgram.getOwner(createWithSeedAccountInBytes)
            const executable = await callSystemProgram.getIsExecutable(createWithSeedAccountInBytes)
            const rentEpoch = await callSystemProgram.getRentEpoch(createWithSeedAccountInBytes)
            const space = await callSystemProgram.getSpace(createWithSeedAccountInBytes)
            const data = await callSystemProgram.getSystemAccountData(createWithSeedAccountInBytes, space)

            expect(info.lamports).to.eq(balance)
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(owner))
            expect(info.executable).to.eq(executable)
            expect(BigInt(info.rentEpoch)).to.be.approximately(rentEpoch, BigInt(1))
            expect(info.space).to.eq(space)
            expect('0x' + info.data.toString('hex')).to.eq(data)

            const rentExemptionBalance = await callSystemProgram.getRentExemptionBalance(space)
            const isRentExempt = await callSystemProgram.isRentExempt(createWithSeedAccountInBytes)

            expect(rentExemptionBalance).to.eq(await solanaConnection.getMinimumBalanceForRentExemption(parseInt(space)))
            expect(isRentExempt).to.eq(true)
        })

        it('Test f64 decoding for rent exemption balance calculation', async function() {
            const SPL_TOKEN_ACCOUNT_SIZE = 165
            const TWO_YEARS_RENT = BigInt(2039280)
            const THREE_POINT_FIVE_YEARS_RENT = BigInt(3568740)
            const ONE_POINT_TWO_YEARS_RENT = BigInt(1223567)
            const ZERO_POINT_FIVE_YEARS_RENT = BigInt(509820)
            const ZERO_POINT_TWENTY_FIVE_YEARS_RENT = BigInt(254910)

            // Example 17 bytes rent data in the same format as it is stored on Solana's
            // SysvarRent111111111111111111111111111111111 account:
            // 980d000000000000 -> u64 lamports_per_byte_year in little-endian right-padded format (= 3480)
            // 0000000000000040 -> f64 exemption_threshold (= 4000000000000000 in little-endian right-padded format, decodes to 2.0)
            // 32 -> u8 burn_percent (= 50)

            expect(await mockCallSystemProgram.getRentExemptionBalance(
                SPL_TOKEN_ACCOUNT_SIZE,
                Buffer.from(
                    '980d000000000000' + // 3480
                    '0000000000000040' + // 2
                    '32',
                    'hex'
                )
            )).to.eq(TWO_YEARS_RENT);

            expect(await mockCallSystemProgram.getRentExemptionBalance(
                SPL_TOKEN_ACCOUNT_SIZE,
                Buffer.from(
                    '980d000000000000' + // 3480
                    '0000000000000c40' + // 3.5
                    '32',
                    'hex'
                )
            )).to.eq(THREE_POINT_FIVE_YEARS_RENT);

            expect(await mockCallSystemProgram.getRentExemptionBalance(
                SPL_TOKEN_ACCOUNT_SIZE,
                Buffer.from(
                    '980d000000000000' + // 3480
                    '333333333333f33f' + // 1.2
                    '32',
                    'hex'
                )
            )).to.eq(ONE_POINT_TWO_YEARS_RENT);

            expect(await mockCallSystemProgram.getRentExemptionBalance(
                SPL_TOKEN_ACCOUNT_SIZE,
                Buffer.from(
                    '980d000000000000' + // 3480
                    '000000000000e03f' + // 0.5
                    '32',
                    'hex'
                )
            )).to.eq(ZERO_POINT_FIVE_YEARS_RENT);

            expect(await mockCallSystemProgram.getRentExemptionBalance(
                SPL_TOKEN_ACCOUNT_SIZE,
                Buffer.from(
                    '980d000000000000' + // 3480
                    '000000000000d03f' + // 0.25
                    '32',
                    'hex'
                )
            )).to.eq(ZERO_POINT_TWENTY_FIVE_YEARS_RENT);
        })

        it('Estimate gas usage of on-chain rent exemption balance calculation', async function() {
            const callData = callSystemProgram.interface.encodeFunctionData(
                "getRentExemptionBalance(uint64)",
                [461] // Arbitrary value
            );
            let gas = await ethers.provider.estimateGas({
                from: deployer.address,
                to: callSystemProgram.target,
                data: callData,
                value: 0,
                function(estimatedGas, err) {
                    if(err) throw err;
                    return estimatedGas
                }
            });
            console.log("CallSystemProgram.getRentExemptionBalance(uint64) gas usage = " + gas);
        })
    })
})