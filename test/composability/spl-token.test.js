import { network, globalOptions } from "hardhat"
import * as _ethers from "ethers"
import { expect } from "chai"
import web3 from "@solana/web3.js"
import { getMint, getAccount, createTransferInstruction } from "@solana/spl-token"
import config from "../config.js"
import { deployContract, airdropSOL } from "./utils.js"
import { getSecrets } from "../../neon-secrets.js";

describe('\u{1F680} \x1b[36mSPL Token program composability tests\x1b[33m',  function() {

    console.log("\nNetwork name: " + globalOptions.network)

    const seed = config.composability.tokenMintSeed[globalOptions.network]
    const decimals = config.composability.tokenMintDecimals[globalOptions.network]
    const ZERO_AMOUNT = BigInt(0)
    const AMOUNT = _ethers.parseUnits('1000', decimals)
    const SMALL_AMOUNT = _ethers.parseUnits('100', decimals)
    const ZERO_BYTES32 = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')
    const WSOL_MINT_PUBKEY = Buffer.from('069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001', 'hex')
    const SPL_TOKEN_ACCOUNT_SIZE = 165

    let ethers,
        solanaConnection,
        deployer,
        neonEVMUser,
        otherNeonEVMUser,
        callSPLTokenProgram,
        callSystemProgram,
        callAssociatedTokenProgram,
        tx,
        contractPublicKeyInBytes,
        deployerPublicKeyInBytes,
        neonEVMUserPublicKeyInBytes,
        otherNeonEVMUserPublicKeyInBytes,
        solanaUser,
        tokenMintInBytes,
        deployerTokenAccountInBytes,
        deployerWSOLTokenAccountInBytes,
        neonEVMUserTokenAccountInBytes,
        solanaUserTokenAccountInBytes,
        solanaUserAssociatedTokenAccountInBytes,
        contractAssociatedTokenAccountInBytes,
        newMintAuthorityInBytes,
        newFreezeAuthorityInBytes,
        currentOwnerInBytes,
        newOwnerInBytes,
        currentCloseAuthorityInBytes,
        newCloseAuthorityInBytes,
        initialDeployerBalance,
        newDeployerBalance,
        initialDeployerTokenAccountBalance,
        newDeployerTokenAccountBalance,
        initialDeployerTokenAccountSOLBalance,
        newDeployerTokenAccountSOLBalance,
        initialDeployerTokenAccountWSOLBalance,
        newDeployerTokenAccountWSOLBalance,
        initialNeonEVMUserTokenAccountBalance,
        newNeonEVMUserTokenAccountBalance,
        initialSolanaUserTokenAccountBalance,
        initialContractTokenAccountBalance,
        info

    before(async function() {
        const { wallets } = await getSecrets()
        ethers = (await network.connect()).ethers
        solanaConnection = new web3.Connection(config.svm_node[globalOptions.network], "processed")
        const deployment = await deployContract(wallets.owner, wallets.user1, 'CallSPLTokenProgram', null)
        deployer = deployment.deployer
        neonEVMUser = deployment.user
        otherNeonEVMUser = deployment.otherUser
        callSPLTokenProgram = deployment.contract
        callSystemProgram = (await deployContract(wallets.owner, wallets.user1, 'CallSystemProgram', null)).contract
        callAssociatedTokenProgram = (await deployContract(wallets.owner, wallets.user1, 'CallAssociatedTokenProgram', null)).contract
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36minitializeMint2\x1b[33m instruction\x1b[0m', function() {

        it('Create and initialize new SPL token mint', async function() {
            tx = await callSPLTokenProgram.connect(deployer).createInitializeTokenMint(
                Buffer.from(seed), // Seed to generate new SPL token mint account on-chain
                decimals, // Decimals value for the new SPL token to be created on Solana
            )
            await tx.wait(1) // Wait for 1 confirmation

            tokenMintInBytes =  await callSPLTokenProgram.getTokenMintAccount(deployer.address, Buffer.from(seed))
            contractPublicKeyInBytes =  await callSPLTokenProgram.getNeonAddress(callSPLTokenProgram.target)
            info = await getMint(solanaConnection, new web3.PublicKey(ethers.encodeBase58(tokenMintInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.mintAuthority.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.freezeAuthority.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.supply).to.eq(ZERO_AMOUNT)
            expect(info.decimals).to.eq(decimals)
            expect(info.isInitialized).to.eq(true)
            expect(info.tlvData.length).to.eq(0)
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s Associated Token program\'s \x1b[36mcreate\x1b[33m instruction\x1b[0m', function() {
        it('Create and initialize new associated token account for third party Solana user', async function() {
            solanaUser = await web3.Keypair.generate()

            tx = await callAssociatedTokenProgram.connect(deployer).createInitializeAssociatedTokenAccount(
                tokenMintInBytes,
                solanaUser.publicKey.toBuffer(), // Pass Solana user public key so that Solana user owns the token account
            )
            await tx.wait(1) // Wait for 1 confirmation

            solanaUserAssociatedTokenAccountInBytes = await callAssociatedTokenProgram.getAssociatedTokenAccount(
                tokenMintInBytes,
                solanaUser.publicKey.toBuffer(),
            )
            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(solanaUserAssociatedTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(solanaUserAssociatedTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(solanaUser.publicKey.toBase58())
            expect(info.delegate).to.be.null
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(ZERO_AMOUNT)
            expect(info.delegatedAmount).to.eq(ZERO_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })

        it('Create and initialize new associated token account for CallAssociatedTokenProgram contract', async function() {
            tx = await callAssociatedTokenProgram.connect(deployer).createInitializeAssociatedTokenAccount(
                tokenMintInBytes,
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), // Leave owner field empty so that CallAssociatedTokenProgram contract owns the token account
            )
            await tx.wait(1) // Wait for 1 confirmation

            contractPublicKeyInBytes =  await callAssociatedTokenProgram.getNeonAddress(callAssociatedTokenProgram.target)

            contractAssociatedTokenAccountInBytes = await callAssociatedTokenProgram.getAssociatedTokenAccount(
                tokenMintInBytes,
                contractPublicKeyInBytes
            )
            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(contractAssociatedTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(contractAssociatedTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate).to.be.null
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(ZERO_AMOUNT)
            expect(info.delegatedAmount).to.eq(ZERO_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36minitializeAccount2\x1b[33m instruction\x1b[0m', function() {

        it('Create and initialize new arbitrary token account for deployer', async function() {
            tx = await callSPLTokenProgram.connect(deployer).createInitializeArbitraryTokenAccount(
                tokenMintInBytes,
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), // Leave owner field empty so that msg.sender controls the token account through CallSPLTokenProgram contract
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), // Leave tokenOwner field empty so that CallSPLTokenProgram contract owns the token account
            )
            await tx.wait(1) // Wait for 1 confirmation

            deployerPublicKeyInBytes = await callSPLTokenProgram.getNeonAddress(deployer.address)
            deployerTokenAccountInBytes = await callSPLTokenProgram.getArbitraryTokenAccount(
                tokenMintInBytes,
                deployerPublicKeyInBytes,
                0 // Arbitrary nonce used to create the arbitrary token account
            )

            contractPublicKeyInBytes =  await callSPLTokenProgram.getNeonAddress(callSPLTokenProgram.target)

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(deployerTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate).to.be.null
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(ZERO_AMOUNT)
            expect(info.delegatedAmount).to.eq(ZERO_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })

        it('Create and initialize new arbitrary token account for third party NeonEVM user', async function() {

            neonEVMUserPublicKeyInBytes = await callSPLTokenProgram.getNeonAddress(neonEVMUser.address)

            tx = await callSPLTokenProgram.connect(deployer).createInitializeArbitraryTokenAccount(
                tokenMintInBytes,
                neonEVMUserPublicKeyInBytes, // Pass NeonEVM user public key so that neonEVMUser controls the token account through CallSPLTokenProgram contract
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), // Leave tokenOwner field empty so that CallSPLTokenProgram contract owns the token account
            )
            await tx.wait(1) // Wait for 1 confirmation

            neonEVMUserTokenAccountInBytes = await callSPLTokenProgram.getArbitraryTokenAccount(
                tokenMintInBytes,
                neonEVMUserPublicKeyInBytes,
                0 // Arbitrary nonce used to create the arbitrary token account
            )
            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate).to.be.null
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(ZERO_AMOUNT)
            expect(info.delegatedAmount).to.eq(ZERO_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })

        it('Create and initialize new arbitrary token account for third party Solana user', async function() {

            tx = await callSPLTokenProgram.connect(deployer).createInitializeArbitraryTokenAccount(
                tokenMintInBytes,
                solanaUser.publicKey.toBuffer(), // Pass Solana user public key so that Solana user controls the token account through CallSPLTokenProgram contract
                solanaUser.publicKey.toBuffer(), // Pass Solana user public key as tokenOwner so that  Solana user owns the token account
            )
            await tx.wait(1) // Wait for 1 confirmation

            solanaUserTokenAccountInBytes = await callSPLTokenProgram.getArbitraryTokenAccount(
                tokenMintInBytes,
                solanaUser.publicKey.toBuffer(),
                0 // Arbitrary nonce used to create the arbitrary token account
            )
            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(solanaUserTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(solanaUserTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(solanaUser.publicKey.toBase58())
            expect(info.delegate).to.be.null
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(ZERO_AMOUNT)
            expect(info.delegatedAmount).to.eq(ZERO_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36mmintTo\x1b[33m instruction\x1b[0m', function() {

        it('Mint SPL token amount to deployer token account', async function() {

            initialDeployerTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )).value.amount)

            tx = await callSPLTokenProgram.connect(deployer).mint(
                Buffer.from(seed), // Seed that was used to generate SPL token mint
                deployerTokenAccountInBytes, // Recipient token account
                AMOUNT // Amount to mint
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await getMint(solanaConnection, new web3.PublicKey(ethers.encodeBase58(tokenMintInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.mintAuthority.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.freezeAuthority.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.supply).to.eq(AMOUNT)
            expect(info.decimals).to.eq(decimals)
            expect(info.isInitialized).to.eq(true)
            expect(info.tlvData.length).to.eq(0)

            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )

            expect(info.value.amount).to.eq((initialDeployerTokenAccountBalance + AMOUNT).toString())
            expect(info.value.decimals).to.eq(decimals)
            expect(info.value.uiAmount).to.eq(parseInt(ethers.formatUnits((initialDeployerTokenAccountBalance + AMOUNT), decimals)))
            expect(info.value.uiAmountString).to.eq(ethers.formatUnits((initialDeployerTokenAccountBalance + AMOUNT), decimals).split('.')[0])
        })

        it('Third party user cannot mint (transaction reverts)', async function() {

            initialNeonEVMUserTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            )).value.amount)

            // Mint tokens (transaction reverts)
            await expect(callSPLTokenProgram.connect(neonEVMUser).mint(
                Buffer.from(seed), // Seed that was used to generate SPL token mint
                neonEVMUserTokenAccountInBytes, // Recipient token account
                AMOUNT // Amount to mint
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'TokenMintDataQuery')

            newNeonEVMUserTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            )).value.amount)

            expect(newNeonEVMUserTokenAccountBalance).to.eq(initialNeonEVMUserTokenAccountBalance)
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36mtransfer\x1b[33m instruction\x1b[0m', function() {

        it('Transfer SPL token amount from deployer token account to NeonEVM user token account', async function() {

            initialDeployerTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )).value.amount)
            initialNeonEVMUserTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            )).value.amount)

            neonEVMUserTokenAccountInBytes = await callSPLTokenProgram.getArbitraryTokenAccount(
                tokenMintInBytes,
                neonEVMUserPublicKeyInBytes,
                0 // Arbitrary nonce used to create the arbitrary token account
            )

            tx = await callSPLTokenProgram.connect(deployer).transfer(
                tokenMintInBytes,
                neonEVMUserTokenAccountInBytes, // Recipient is NeonEVM user token account
                SMALL_AMOUNT // Amount to transfer
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )

            expect(info.value.amount).to.eq((initialDeployerTokenAccountBalance - SMALL_AMOUNT).toString())
            expect(info.value.decimals).to.eq(decimals)
            expect(info.value.uiAmount).to.eq(parseInt(ethers.formatUnits((initialDeployerTokenAccountBalance - SMALL_AMOUNT), decimals)))
            expect(info.value.uiAmountString).to.eq(ethers.formatUnits((initialDeployerTokenAccountBalance - SMALL_AMOUNT), decimals).split('.')[0])

            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            )

            expect(info.value.amount).to.eq((initialNeonEVMUserTokenAccountBalance + SMALL_AMOUNT).toString())
            expect(info.value.decimals).to.eq(decimals)
            expect(info.value.uiAmount).to.eq(parseInt(ethers.formatUnits((initialNeonEVMUserTokenAccountBalance + SMALL_AMOUNT), decimals)))
            expect(info.value.uiAmountString).to.eq(ethers.formatUnits((initialNeonEVMUserTokenAccountBalance + SMALL_AMOUNT), decimals).split('.')[0])
        })

        it('Transfer SPL token amount from NeonEVM user token account to Solana user associated token account', async function() {

            initialNeonEVMUserTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            )).value.amount)
            initialSolanaUserTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(solanaUserAssociatedTokenAccountInBytes))
            )).value.amount)

            tx = await callSPLTokenProgram.connect(neonEVMUser).transfer(
                tokenMintInBytes,
                solanaUserAssociatedTokenAccountInBytes, // Recipient is Solana user associated token account
                SMALL_AMOUNT // Amount to transfer
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            )

            expect(info.value.amount).to.eq((initialNeonEVMUserTokenAccountBalance - SMALL_AMOUNT).toString())
            expect(info.value.decimals).to.eq(decimals)
            expect(info.value.uiAmount).to.eq(parseInt(ethers.formatUnits((initialNeonEVMUserTokenAccountBalance - SMALL_AMOUNT), decimals)))
            expect(info.value.uiAmountString).to.eq(ethers.formatUnits((initialNeonEVMUserTokenAccountBalance - SMALL_AMOUNT), decimals).split('.')[0])

            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(solanaUserAssociatedTokenAccountInBytes))
            )

            expect(info.value.amount).to.eq((initialSolanaUserTokenAccountBalance + SMALL_AMOUNT).toString())
            expect(info.value.decimals).to.eq(decimals)
            expect(info.value.uiAmount).to.eq(parseInt(ethers.formatUnits((initialSolanaUserTokenAccountBalance + SMALL_AMOUNT), decimals)))
            expect(info.value.uiAmountString).to.eq(ethers.formatUnits((initialSolanaUserTokenAccountBalance + SMALL_AMOUNT), decimals).split('.')[0])
        })

        it('Transfer SPL token amount from Solana user associated token account to contract associated token account', async function() {

            initialSolanaUserTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(solanaUserAssociatedTokenAccountInBytes))
            )).value.amount)
            initialContractTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(contractAssociatedTokenAccountInBytes))
            )).value.amount)

            tx = new web3.Transaction()
            tx.add(createTransferInstruction(
                new web3.PublicKey(ethers.encodeBase58(solanaUserAssociatedTokenAccountInBytes)),
                new web3.PublicKey(ethers.encodeBase58(contractAssociatedTokenAccountInBytes)),
                solanaUser.publicKey,
                SMALL_AMOUNT
            ))
            await airdropSOL(solanaUser.publicKey, parseInt(SMALL_AMOUNT.toString()))
            await web3.sendAndConfirmTransaction(solanaConnection, tx, [solanaUser])

            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(solanaUserAssociatedTokenAccountInBytes))
            )

            expect(info.value.amount).to.eq((initialSolanaUserTokenAccountBalance - SMALL_AMOUNT).toString())
            expect(info.value.decimals).to.eq(decimals)
            expect(info.value.uiAmount).to.eq(parseInt(ethers.formatUnits((initialSolanaUserTokenAccountBalance - SMALL_AMOUNT), decimals)))
            expect(info.value.uiAmountString).to.eq(ethers.formatUnits((initialSolanaUserTokenAccountBalance - SMALL_AMOUNT), decimals).split('.')[0])

            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(contractAssociatedTokenAccountInBytes))
            )

            expect(info.value.amount).to.eq((initialContractTokenAccountBalance + SMALL_AMOUNT).toString())
            expect(info.value.decimals).to.eq(decimals)
            expect(info.value.uiAmount).to.eq(parseInt(ethers.formatUnits((initialContractTokenAccountBalance + SMALL_AMOUNT), decimals)))
            expect(info.value.uiAmountString).to.eq(ethers.formatUnits((initialContractTokenAccountBalance + SMALL_AMOUNT), decimals).split('.')[0])
        })

        it('Transfer SPL token amount from contract associated token account to deployer token account', async function() {

            initialContractTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(contractAssociatedTokenAccountInBytes))
            )).value.amount)
            initialDeployerTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )).value.amount)

            tx = await callAssociatedTokenProgram.connect(deployer).transfer(
                tokenMintInBytes,
                deployerTokenAccountInBytes, // Recipient is NeonEVM user token account
                SMALL_AMOUNT // Amount to transfer
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(contractAssociatedTokenAccountInBytes))
            )

            expect(info.value.amount).to.eq((initialContractTokenAccountBalance - SMALL_AMOUNT).toString())
            expect(info.value.decimals).to.eq(decimals)
            expect(info.value.uiAmount).to.eq(parseInt(ethers.formatUnits((initialContractTokenAccountBalance - SMALL_AMOUNT), decimals)))
            expect(info.value.uiAmountString).to.eq(ethers.formatUnits((initialContractTokenAccountBalance - SMALL_AMOUNT), decimals).split('.')[0])

            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )

            expect(info.value.amount).to.eq((initialDeployerTokenAccountBalance + SMALL_AMOUNT).toString())
            expect(info.value.decimals).to.eq(decimals)
            expect(info.value.uiAmount).to.eq(parseInt(ethers.formatUnits((initialDeployerTokenAccountBalance + SMALL_AMOUNT), decimals)))
            expect(info.value.uiAmountString).to.eq(ethers.formatUnits((initialDeployerTokenAccountBalance + SMALL_AMOUNT), decimals).split('.')[0])
        })

        it('User with zero balance cannot transfer (transaction reverts)', async function() {

            initialNeonEVMUserTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            )).value.amount)

            expect(initialNeonEVMUserTokenAccountBalance).to.eq(ZERO_AMOUNT)

            await expect(callSPLTokenProgram.connect(neonEVMUser).transfer(
                tokenMintInBytes,
                neonEVMUserTokenAccountInBytes,
                AMOUNT
            )).to.be.revertedWith(
                "External call fails TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: Error processing Instruction 0: custom program error: 0x1"
            )

            newNeonEVMUserTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            )).value.amount)

            expect(newNeonEVMUserTokenAccountBalance).to.eq(initialNeonEVMUserTokenAccountBalance)
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36mapprove\x1b[33m instruction\x1b[0m', function() {

        it('User without approval cannot claim (transaction reverts)', async function() {

            await expect(callSPLTokenProgram.connect(neonEVMUser).claim(
                deployerTokenAccountInBytes, // Spend from deployer token account
                neonEVMUserTokenAccountInBytes, // Recipient token account
                SMALL_AMOUNT // Claimed amount
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'InvalidSpender')
        })

        it('Delegate deployer token account to NeonEVM user', async function() {

            initialDeployerTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )).value.amount)

            tx = await callSPLTokenProgram.connect(deployer).approve(
                tokenMintInBytes,
                neonEVMUserPublicKeyInBytes, // delegate
                SMALL_AMOUNT // Delegated amount
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(deployerTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate.toBase58()).to.eq(ethers.encodeBase58(neonEVMUserPublicKeyInBytes))
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(initialDeployerTokenAccountBalance)
            expect(info.delegatedAmount).to.eq(SMALL_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })

        it('Claim tokens from delegated token account', async function() {

            initialDeployerTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )).value.amount)
            initialNeonEVMUserTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            )).value.amount)

            tx = await callSPLTokenProgram.connect(neonEVMUser).claim(
                deployerTokenAccountInBytes, // Spend from deployer token account
                neonEVMUserTokenAccountInBytes, // Recipient token account
                SMALL_AMOUNT // Claimed amount
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(deployerTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate.toBase58()).to.eq(ethers.encodeBase58(neonEVMUserPublicKeyInBytes))
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(initialDeployerTokenAccountBalance - SMALL_AMOUNT)
            expect(info.delegatedAmount).to.eq(SMALL_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate).to.be.null
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(initialNeonEVMUserTokenAccountBalance + SMALL_AMOUNT)
            expect(info.delegatedAmount).to.eq(ZERO_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })

        it('User without initialized token account cannot delegate (transaction reverts)', async function() {
            await expect(callSPLTokenProgram.connect(otherNeonEVMUser).approve(
                tokenMintInBytes,
                neonEVMUserPublicKeyInBytes,
                AMOUNT
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'TokenAccountDataQuery')
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36mrevoke\x1b[33m instruction\x1b[0m', function() {

        it('Revoke deployer token account delegation to NeonEVM user', async function() {

            initialDeployerTokenAccountBalance = BigInt((await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )).value.amount)

            tx = await callSPLTokenProgram.connect(deployer).revokeApproval(
                tokenMintInBytes,
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(deployerTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate).to.be.null
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(initialDeployerTokenAccountBalance)
            expect(info.delegatedAmount).to.eq(ZERO_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })

        it('User without initialized token account cannot revoke approval (transaction reverts)', async function() {
            await expect(callSPLTokenProgram.connect(otherNeonEVMUser).revokeApproval(
                tokenMintInBytes
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'TokenAccountDataQuery')
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36msetAuthority\x1b[33m instruction\x1b[0m', function() {

        it("User can only update SPL token mint's MINT or FREEZE authority (otherwise transaction reverts)", async function() {
            newOwnerInBytes = (await web3.Keypair.generate()).publicKey.toBuffer()


            await expect(callSPLTokenProgram.connect(otherNeonEVMUser).updateTokenMintAuthority(
                Buffer.from(seed), // Seed that was used to generate SPL token mint
                2, // OWNER authority
                newOwnerInBytes
            )).to.be
                .revertedWithCustomError(callSPLTokenProgram, 'InvalidTokenMintAuthorityType')
                .withArgs(
                    await callSPLTokenProgram.getTokenMintAccount(otherNeonEVMUser, Buffer.from(seed))
                )
        })

        it("Update SPL token mint's MINT authority", async function() {

            newMintAuthorityInBytes = (await web3.Keypair.generate()).publicKey.toBuffer()

            tx = await callSPLTokenProgram.connect(deployer).updateTokenMintAuthority(
                Buffer.from(seed), // Seed that was used to generate SPL token mint
                0, // MINT authority
                newMintAuthorityInBytes
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await getMint(solanaConnection, new web3.PublicKey(ethers.encodeBase58(tokenMintInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.mintAuthority.toBase58()).to.eq(ethers.encodeBase58(newMintAuthorityInBytes))
            expect(info.freezeAuthority.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.supply).to.eq(AMOUNT)
            expect(info.decimals).to.eq(decimals)
            expect(info.isInitialized).to.eq(true)
            expect(info.tlvData.length).to.eq(0)
        })

        it("Previous MINT authority cannot update SPL token mint's MINT authority anymore (transaction reverts)", async function() {
            await expect(callSPLTokenProgram.connect(deployer).updateTokenMintAuthority(
                Buffer.from(seed), // Seed that was used to generate SPL token mint
                0, // MINT authority
                newMintAuthorityInBytes
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'InvalidMintAuthority')
                .withArgs(
                    tokenMintInBytes,
                    newMintAuthorityInBytes,
                    contractPublicKeyInBytes
                )
        })

        it("Third party user cannot update SPL token mint's MINT authority (transaction reverts)", async function() {
            await expect(callSPLTokenProgram.connect(otherNeonEVMUser).updateTokenMintAuthority(
                Buffer.from(seed), // Seed that was used to generate SPL token mint
                0, // MINT authority
                newMintAuthorityInBytes
            )).to.be.be.revertedWithCustomError(callSPLTokenProgram, 'TokenMintDataQuery')
        })

        it("Update SPL token mint's FREEZE authority", async function() {

            newFreezeAuthorityInBytes = (await web3.Keypair.generate()).publicKey.toBuffer()

            tx = await callSPLTokenProgram.connect(deployer).updateTokenMintAuthority(
                Buffer.from(seed), // Seed that was used to generate SPL token mint
                1, // FREEZE authority
                newFreezeAuthorityInBytes
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await getMint(solanaConnection, new web3.PublicKey(ethers.encodeBase58(tokenMintInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.mintAuthority.toBase58()).to.eq(ethers.encodeBase58(newMintAuthorityInBytes))
            expect(info.freezeAuthority.toBase58()).to.eq(ethers.encodeBase58(newFreezeAuthorityInBytes))
            expect(info.supply).to.eq(AMOUNT)
            expect(info.decimals).to.eq(decimals)
            expect(info.isInitialized).to.eq(true)
            expect(info.tlvData.length).to.eq(0)
        })

        it("Previous FREEZE authority cannot update SPL token mint's FREEZE authority anymore (transaction reverts)", async function() {
            await expect(callSPLTokenProgram.connect(deployer).updateTokenMintAuthority(
                Buffer.from(seed), // Seed that was used to generate SPL token mint
                1, // FREEZE authority
                newFreezeAuthorityInBytes
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'InvalidFreezeAuthority')
                .withArgs(
                    tokenMintInBytes,
                    newFreezeAuthorityInBytes,
                    contractPublicKeyInBytes
                )
        })

        it("Third party user cannot update SPL token mint's FREEZE authority (transaction reverts)", async function() {
            await expect(callSPLTokenProgram.connect(otherNeonEVMUser).updateTokenMintAuthority(
                Buffer.from(seed), // Seed that was used to generate SPL token mint
                1, // FREEZE authority
                newFreezeAuthorityInBytes
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'TokenMintDataQuery')
        })

        it("SPL token account's OWNER can update undefined SPL token account's CLOSE authority", async function() {

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes)))
            expect(info.closeAuthority).to.be.null

            tx = await callSPLTokenProgram.connect(neonEVMUser).updateTokenAccountAuthority(
                tokenMintInBytes, // Token mint associated with the token account of which we want to update authority
                3, // CLOSE authority
                contractPublicKeyInBytes,
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate).to.be.null
            expect(info.closeAuthority.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })

        it("SPL token account's CLOSE authority can update SPL token account's CLOSE authority", async function() {

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes)))
            expect(info.closeAuthority.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))

            newCloseAuthorityInBytes = (await web3.Keypair.generate()).publicKey.toBuffer()

            tx = await callSPLTokenProgram.connect(neonEVMUser).updateTokenAccountAuthority(
                tokenMintInBytes, // Token mint associated with the token account of which we want to update authority
                3, // CLOSE authority
                newCloseAuthorityInBytes,
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate).to.be.null
            expect(info.closeAuthority.toBase58()).to.eq(ethers.encodeBase58(newCloseAuthorityInBytes))
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })

        it("SPL token account's OWNER cannot update already defined SPL token account's CLOSE authority (transaction reverts)", async function() {

            await expect(callSPLTokenProgram.connect(neonEVMUser).updateTokenAccountAuthority(
                tokenMintInBytes,
                3,
                contractPublicKeyInBytes,
            )).to.be.revertedWith(
                "Solana Program Error: A signature was required but not found"
            )
        })

        it("User without initialized token account cannot update SPL token account's CLOSE authority (transaction reverts)", async function() {
            await expect(callSPLTokenProgram.connect(otherNeonEVMUser).updateTokenAccountAuthority(
                tokenMintInBytes, // Token mint associated with the token account of which we want to update authority
                3, // CLOSE authority
                newCloseAuthorityInBytes,
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'TokenAccountDataQuery')
        })

        it("SPL token account's OWNER can update SPL token account's OWNER authority", async function() {

            newOwnerInBytes = (await web3.Keypair.generate()).publicKey.toBuffer()

            tx = await callSPLTokenProgram.connect(neonEVMUser).updateTokenAccountAuthority(
                tokenMintInBytes, // Token mint associated with the token account of which we want to update authority
                2, // OWNER authority
                newOwnerInBytes,
            )
            await tx.wait(1) // Wait for 1 confirmation

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(newOwnerInBytes))
            expect(info.delegate).to.be.null
            expect(info.closeAuthority.toBase58()).to.eq(ethers.encodeBase58(newCloseAuthorityInBytes))
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(false)
            expect(info.rentExemptReserve).to.be.null
            expect(info.tlvData.length).to.eq(0)
        })

        it("Previous token account's OWNER cannot update SPL token account OWNER anymore (transaction reverts)", async function() {
            currentOwnerInBytes = newOwnerInBytes
            newOwnerInBytes = (await web3.Keypair.generate()).publicKey.toBuffer()

            await expect(callSPLTokenProgram.connect(neonEVMUser).updateTokenAccountAuthority(
                tokenMintInBytes, // Token mint associated with the token account of which we want to update authority
                2, // OWNER authority
                newOwnerInBytes,
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'InvalidOwnerAuthority')
                .withArgs(
                    await callSPLTokenProgram.getArbitraryTokenAccount(
                        tokenMintInBytes,
                        await callSPLTokenProgram.getNeonAddress(neonEVMUser),
                        0 // Arbitrary nonce used to create the arbitrary token account
                    ),
                    currentOwnerInBytes,
                    contractPublicKeyInBytes
                )
        })

        it("Previous token account's OWNER cannot update SPL token account CLOSE authority (transaction reverts)", async function() {
            currentCloseAuthorityInBytes = newCloseAuthorityInBytes
            newCloseAuthorityInBytes = (await web3.Keypair.generate()).publicKey.toBuffer()

            await expect(callSPLTokenProgram.connect(neonEVMUser).updateTokenAccountAuthority(
                tokenMintInBytes, // Token mint associated with the token account of which we want to update authority
                3, // CLOSE authority
                newCloseAuthorityInBytes,
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'InvalidCloseAuthority')
                .withArgs(
                    await callSPLTokenProgram.getArbitraryTokenAccount(
                        tokenMintInBytes,
                        await callSPLTokenProgram.getNeonAddress(neonEVMUser),
                        0 // Arbitrary nonce used to create the arbitrary token account
                    ),
                    currentOwnerInBytes,
                    currentCloseAuthorityInBytes,
                    contractPublicKeyInBytes
                )
        })

    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36mburn\x1b[33m instruction\x1b[0m', function() {

        it("Burn tokens", async function() {

            // Check initial token balance of deployer token account
            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )
            initialDeployerTokenAccountBalance = BigInt(info.value.amount)

            // Burn tokens
            tx = await callSPLTokenProgram.connect(deployer).burn(
                tokenMintInBytes, // Token mint associated with the token account from which we want to burn tokens
                SMALL_AMOUNT, // Amount we want to burn
            )
            await tx.wait(1) // Wait for 1 confirmation

            // Check new token balance of deployer token account
            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )
            newDeployerTokenAccountBalance = BigInt(info.value.amount)

            expect(initialDeployerTokenAccountBalance - newDeployerTokenAccountBalance).to.eq(SMALL_AMOUNT)
        })

        it("User cannot burn more than token balance (transaction reverts)", async function() {

            // Check initial token balance of deployer token account
            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )
            initialDeployerTokenAccountBalance = BigInt(info.value.amount)

            // Burn tokens
            await expect(callSPLTokenProgram.connect(deployer).burn(
                tokenMintInBytes,
                initialDeployerTokenAccountBalance + SMALL_AMOUNT,
            )).to.be.revertedWith("External call fails TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: Error processing Instruction 0: custom program error: 0x1")
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36msyncNative\x1b[33m instruction\x1b[0m', function() {

        before('Create and initialize new WSOL token account for deployer', async function() {

            tx = await callSPLTokenProgram.connect(deployer).createInitializeArbitraryTokenAccount(
                WSOL_MINT_PUBKEY,
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), // Leave owner field empty so that msg.sender controls the token account through CallSPLTokenProgram contract
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), // Leave tokenOwner field empty so that CallSPLTokenProgram contract owns the token account
            )
            await tx.wait(1) // Wait for 1 confirmation

            deployerPublicKeyInBytes = await callSPLTokenProgram.getNeonAddress(deployer.address)
            deployerWSOLTokenAccountInBytes = await callSPLTokenProgram.getArbitraryTokenAccount(
                WSOL_MINT_PUBKEY,
                deployerPublicKeyInBytes,
                0 // Arbitrary nonce used to create the arbitrary token account
            )
            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(deployerWSOLTokenAccountInBytes)))

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(deployerWSOLTokenAccountInBytes))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(WSOL_MINT_PUBKEY))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(contractPublicKeyInBytes))
            expect(info.delegate).to.be.null
            expect(info.closeAuthority).to.be.null
            expect(info.amount).to.eq(ZERO_AMOUNT)
            expect(info.delegatedAmount).to.eq(ZERO_AMOUNT)
            expect(info.isInitialized).to.eq(true)
            expect(info.isFrozen).to.eq(false)
            expect(info.isNative).to.eq(true) // WSOL ATAs are "native" topken accounts
            expect(info.rentExemptReserve).to.eq(await callSystemProgram.getRentExemptionBalance(SPL_TOKEN_ACCOUNT_SIZE)) // WSOL ATAs have rentExemptReserve
            expect(info.tlvData.length).to.eq(0)
        })


        it("Sync deployer's WSOL token balance", async function() {

            // Airdrop SOL to deployer's WSOL token account
            await airdropSOL(new web3.PublicKey(ethers.encodeBase58(deployerWSOLTokenAccountInBytes)), parseInt(SMALL_AMOUNT.toString()))
            initialDeployerTokenAccountSOLBalance = await solanaConnection.getBalance(new web3.PublicKey(ethers.encodeBase58(deployerWSOLTokenAccountInBytes)))
            expect(initialDeployerTokenAccountSOLBalance).to.eq((await callSystemProgram.getRentExemptionBalance(SPL_TOKEN_ACCOUNT_SIZE)) + SMALL_AMOUNT)

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(deployerWSOLTokenAccountInBytes)))
            initialDeployerTokenAccountWSOLBalance = info.amount
            expect(initialDeployerTokenAccountWSOLBalance).to.eq(ZERO_AMOUNT)

            // Sync native
            tx = await callSPLTokenProgram.syncWrappedSOLAccount(deployerWSOLTokenAccountInBytes)
            await tx.wait(1) // Wait for 1 confirmation

            // Check token account WSOL and SOL balances
            newDeployerTokenAccountSOLBalance = await solanaConnection.getBalance(new web3.PublicKey(ethers.encodeBase58(deployerWSOLTokenAccountInBytes)))
            expect(newDeployerTokenAccountSOLBalance).to.eq(initialDeployerTokenAccountSOLBalance) // SOL balance has not changed
            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(deployerWSOLTokenAccountInBytes)))
            newDeployerTokenAccountWSOLBalance = info.amount
            expect(newDeployerTokenAccountWSOLBalance - initialDeployerTokenAccountWSOLBalance).to.eq(SMALL_AMOUNT) // wSOL balance has been synced
        })

        it("User cannot sync a non-native token account (transaction reverts)", async function() {

            // Airdrop SOL to deployer's non-native token account
            await airdropSOL(new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes)), parseInt(SMALL_AMOUNT.toString()))
            initialDeployerTokenAccountSOLBalance = await solanaConnection.getBalance(new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes)))
            expect(initialDeployerTokenAccountSOLBalance).to.eq((await callSystemProgram.getRentExemptionBalance(SPL_TOKEN_ACCOUNT_SIZE)) + SMALL_AMOUNT)

            // Sync native
            await expect(callSPLTokenProgram.syncWrappedSOLAccount(deployerTokenAccountInBytes)).to.be.revertedWith(
                "External call fails TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: Error processing Instruction 0: custom program error: 0x13"
            )
        })
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s SPL Token program\'s \x1b[36mcloseAccount\x1b[33m instruction\x1b[0m', function() {

        it("User cannot close SPL token account which has non-zero token balance (transaction reverts)", async function() {

            // Check initial token balance of deployer token account
            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )
            initialDeployerTokenAccountBalance = BigInt(info.value.amount)

            expect(BigInt(initialDeployerTokenAccountBalance)).to.be.greaterThan(ZERO_AMOUNT)

            // Close deployer token account
            await expect(callSPLTokenProgram.connect(deployer).closeTokenAccount(
                tokenMintInBytes,
                deployerPublicKeyInBytes
            )).to.be.revertedWith(
                "External call fails TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: Error processing Instruction 0: custom program error: 0xb"
            )
        })

        it("Close SPL token account", async function() {

            // Check initial token balance of deployer token account
            info = await solanaConnection.getTokenAccountBalance(
                new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
            )
            initialDeployerTokenAccountBalance = BigInt(info.value.amount)

            // SPL token account must have zero token balance before being closed
            if(initialDeployerTokenAccountBalance > 0) {
                tx = await callSPLTokenProgram.connect(deployer).transfer(
                    tokenMintInBytes,
                    neonEVMUserTokenAccountInBytes, // Recipient is NeonEVM user token account
                    initialDeployerTokenAccountBalance // Amount to transfer
                )
                await tx.wait(1) // Wait for 1 confirmation

                info = await solanaConnection.getTokenAccountBalance(
                    new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes))
                )
                expect(info.value.amount).to.eq(ZERO_AMOUNT.toString())
            }

            // deployer token account's SOL balance will be transferred to deployer account
            initialDeployerBalance = await solanaConnection.getBalance(new web3.PublicKey(ethers.encodeBase58(deployerPublicKeyInBytes)))
            initialDeployerTokenAccountSOLBalance = await solanaConnection.getBalance(new web3.PublicKey(ethers.encodeBase58(deployerTokenAccountInBytes)))

            // Close deployer token account
            tx = await callSPLTokenProgram.connect(deployer).closeTokenAccount(
                tokenMintInBytes, // Token mint associated with the token account which we want to close
                deployerPublicKeyInBytes // account which will receive the closed token account's SOL balance
            )
            await tx.wait(1) // Wait for 1 confirmation

            // Check that token account does not exist anymore
            await expect(callSPLTokenProgram.getSPLTokenAccountData(deployerTokenAccountInBytes))
                .to.be.revertedWithCustomError(callSPLTokenProgram, 'TokenAccountDataQuery')

            // Check that token account balance was transferred to deployer account
            newDeployerBalance = await solanaConnection.getBalance(new web3.PublicKey(ethers.encodeBase58(deployerPublicKeyInBytes)))
            expect(newDeployerBalance - initialDeployerBalance).to.eq(initialDeployerTokenAccountSOLBalance)
        })

        it("User cannot close SPL token account which has not been initialized (transaction reverts)", async function() {

            otherNeonEVMUserPublicKeyInBytes = await callSPLTokenProgram.getNeonAddress(otherNeonEVMUser.address)

            // Close user token account
            await expect(callSPLTokenProgram.connect(otherNeonEVMUser).closeTokenAccount(
                tokenMintInBytes,
                otherNeonEVMUserPublicKeyInBytes
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'TokenAccountDataQuery')
        })
    })

    describe('\n\u{231B} \x1b[33m Testing Solana\'s SPL Token program \x1b[36mdata getters\x1b[33m\x1b[0m', async function() {

        it('Call SPL token mint data getters', async function() {

            info = await getMint(solanaConnection, new web3.PublicKey(ethers.encodeBase58(tokenMintInBytes)))

            const tokenMintIsInitialized= await callSPLTokenProgram.getSPLTokenMintIsInitialized(tokenMintInBytes)
            const tokenSupply = await callSPLTokenProgram.getSPLTokenSupply(tokenMintInBytes)
            const tokenDecimals = await callSPLTokenProgram.getSPLTokenDecimals(tokenMintInBytes)
            const tokenMintAuthority = await callSPLTokenProgram.getSPLTokenMintAuthority(tokenMintInBytes)
            const tokenFreezeAuthority = await callSPLTokenProgram.getSPLTokenFreezeAuthority(tokenMintInBytes)
            const tokenMintData = await callSPLTokenProgram.getSPLTokenMintData(tokenMintInBytes)

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(tokenMintInBytes))

            if(info.isInitialized) {
                expect(tokenMintIsInitialized).to.eq(true)
                expect(tokenMintData[4]).to.eq(true)
            } else {
                expect(tokenMintIsInitialized).to.eq(false)
                expect(tokenMintData[4]).to.eq(false)
            }

            expect(info.supply).to.eq(tokenSupply)
            expect(info.supply).to.eq(tokenMintData[2])

            expect(info.decimals).to.eq(tokenDecimals)
            expect(info.decimals).to.eq(tokenMintData[3])

            expect(info.mintAuthority.toBase58()).to.eq(ethers.encodeBase58(tokenMintAuthority))
            expect(info.mintAuthority.toBase58()).to.eq(ethers.encodeBase58(tokenMintData[1]))

            expect(info.freezeAuthority.toBase58()).to.eq(ethers.encodeBase58(tokenFreezeAuthority))
            expect(info.freezeAuthority.toBase58()).to.eq(ethers.encodeBase58(tokenMintData[6]))
        })


        it('Call SPL token account data getters', async function() {

            info = await getAccount(solanaConnection, new web3.PublicKey(ethers.encodeBase58(neonEVMUserTokenAccountInBytes)))

            const ataIsInitialized = await callSPLTokenProgram.getSPLTokenAccountIsInitialized(neonEVMUserTokenAccountInBytes)
            const ataIsNative = await callSPLTokenProgram.getSPLTokenAccountIsNative(neonEVMUserTokenAccountInBytes)
            const TokenAccountBalance = await callSPLTokenProgram.getSPLTokenAccountBalance(neonEVMUserTokenAccountInBytes)
            const ataOwner = await callSPLTokenProgram.getSPLTokenAccountOwner(neonEVMUserTokenAccountInBytes)
            const ataMint = await callSPLTokenProgram.getSPLTokenAccountMint(neonEVMUserTokenAccountInBytes)
            const ataDelegate = await callSPLTokenProgram.getSPLTokenAccountDelegate(neonEVMUserTokenAccountInBytes)
            const ataDelegatedAmount = await callSPLTokenProgram.getSPLTokenAccountDelegatedAmount(neonEVMUserTokenAccountInBytes)
            const ataCloseAuthority = await callSPLTokenProgram.getSPLTokenAccountCloseAuthority(neonEVMUserTokenAccountInBytes)
            const ataData = await callSPLTokenProgram.getSPLTokenAccountData(neonEVMUserTokenAccountInBytes)

            expect(info.address.toBase58()).to.eq(ethers.encodeBase58(neonEVMUserTokenAccountInBytes))

            if(info.isInitialized) {
                expect(ataIsInitialized).to.eq(true)
                expect(ataData[5]).to.eq(true)
            } else {
                expect(ataIsInitialized).to.eq(false)
                expect(ataData[5]).to.eq(false)
            }

            if(info.isNative) {
                expect(ataIsNative).to.eq(true)
                expect(ataData[7]).to.eq(true)
            } else {
                expect(ataIsNative).to.eq(false)
                expect(ataData[7]).to.eq(false)
            }

            expect(info.amount).to.eq(TokenAccountBalance)
            expect(info.amount).to.eq(ataData[2])

            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(ataOwner))
            expect(info.owner.toBase58()).to.eq(ethers.encodeBase58(ataData[1]))

            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(ataMint))
            expect(info.mint.toBase58()).to.eq(ethers.encodeBase58(ataData[0]))

            if(info.delegate) {
                expect(info.delegate.toBase58()).to.eq(ethers.encodeBase58(ataDelegate))
                expect(info.delegate.toBase58()).to.eq(ethers.encodeBase58(ataData[4]))
            }

            expect(info.delegatedAmount).to.eq(ataDelegatedAmount)
            expect(info.delegatedAmount).to.eq(ataData[8])

            if(info.closeAuthority) {
                expect(info.closeAuthority.toBase58()).to.eq(ethers.encodeBase58(ataCloseAuthority))
                expect(info.closeAuthority.toBase58()).to.eq(ethers.encodeBase58(ataData[10]))
            } else {
                expect(ataCloseAuthority).to.eq('0x' + ZERO_BYTES32.toString('hex'))
                expect(ataData[10]).to.eq('0x' + ZERO_BYTES32.toString('hex'))
            }
        })
    })
})
