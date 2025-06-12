import { network, globalOptions } from "hardhat"
import { expect } from "chai"
import web3 from "@solana/web3.js"
import config from "../config.js"
import { deployContract } from "./utils.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { findMetadataPda } from "@metaplex-foundation/mpl-token-metadata"
import { publicKey } from "@metaplex-foundation/umi"
import { getSecrets } from "../../neon-secrets.js";

describe('\u{1F680} \x1b[36mMetaplex program composability tests\x1b[33m', function() {

    console.log("\nNetwork name: " + globalOptions.network)

    const seed = config.composability.tokenMintSeed[globalOptions.network]
    const second_seed = "mySecondTokenMintSeed"
    const third_seed = "myThirdTokenMintSeed"
    const decimals = config.composability.tokenMintDecimals[globalOptions.network]
    const tokenName = config.composability.tokenMetadata[globalOptions.network].tokenName
    const tokenSymbol = config.composability.tokenMetadata[globalOptions.network].tokenSymbol
    const uri = config.composability.tokenMetadata[globalOptions.network].uri
    const isMutable = true
    const ZERO_BYTES32 = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')
    const newUpdateAuthorityInBytes = web3.Keypair.generate().publicKey.toBuffer()

    let ethers,
        deployer,
        neonEVMUser,
        otherNeonEVMUser,
        callMetaplexProgram,
        callSPLTokenProgram,
        callSystemProgram,
        callAssociatedTokenProgram,
        tx,
        contractPublicKeyInBytes,
        tokenMintInBytes,
        otherTokenMintInBytes

    before(async function() {
        const { wallets } = await getSecrets()
        ethers = (await network.connect()).ethers
        const deployment = await deployContract(wallets.owner, wallets.user1, 'CallSPLTokenProgram', null)
        deployer = deployment.deployer
        neonEVMUser = deployment.user
        otherNeonEVMUser = deployment.otherUser
        callSPLTokenProgram = deployment.contract
        callMetaplexProgram = (await deployContract(wallets.owner, wallets.user1, 'CallMetaplexProgram', null)).contract
        callSystemProgram = (await deployContract(wallets.owner, wallets.user1, 'CallSystemProgram', null)).contract
        callAssociatedTokenProgram = (await deployContract(wallets.owner, wallets.user1, 'CallAssociatedTokenProgram', null)).contract
        // Create and initialize new SPL token mint
        tx = await callSPLTokenProgram.connect(deployer).createInitializeTokenMint(
            Buffer.from(seed), // Seed to generate new SPL token mint account on-chain
            decimals, // Decimals value for the new SPL token to be created on Solana
        )
        await tx.wait(1) // Wait for 1 confirmation
        tokenMintInBytes =  await callSPLTokenProgram.getTokenMintAccount(deployer.address, Buffer.from(seed))
        console.log("\nCreated and initialized new SPL Token mint: " + ethers.encodeBase58(tokenMintInBytes) + "\n")
        contractPublicKeyInBytes =  await callSPLTokenProgram.getNeonAddress(callSPLTokenProgram.target)
    })

    describe('\n\u{231B} \x1b[33m Testing on-chain formatting and execution of Solana\'s Metaplex program \x1b[36mcreateMetadataAccountV3\x1b[33m instruction\x1b[0m', function() {

        it('Create token metadata account', async function() {
            tx = await callSPLTokenProgram.connect(deployer).createTokenMetadataAccount(
                Buffer.from(seed), // Seed that was used to create SPL token mint account
                tokenName,
                tokenSymbol,
                uri,
                isMutable
            )
            await tx.wait(1) // Wait for 1 confirmation
            // Get full token metadata
            const metadata = await callSPLTokenProgram.getTokenMetadata(tokenMintInBytes)
            expect(metadata[0].split("\x00")[0]).to.eq(tokenName)
            expect(metadata[1].split("\x00")[0]).to.eq(tokenSymbol)
            expect(metadata[2].split("\x00")[0]).to.eq(uri)
            expect(metadata[3]).to.eq(isMutable)
            expect(metadata[4]).to.eq(contractPublicKeyInBytes)
            // Get token name
            const _tokenName = (await callSPLTokenProgram.getTokenName(tokenMintInBytes)).split("\x00")[0]
            expect(_tokenName).to.eq(tokenName)
            // Get token symbol
            const _tokenSymbol = (await callSPLTokenProgram.getTokenSymbol(tokenMintInBytes)).split("\x00")[0]
            expect(_tokenSymbol).to.eq(tokenSymbol)
            // Get uri
            const _uri = (await callSPLTokenProgram.getUri(tokenMintInBytes)).split("\x00")[0]
            expect(_uri).to.eq(uri)
            // Get isMutable flag
            const _isMutable = await callSPLTokenProgram.getMetadataIsMutable(tokenMintInBytes)
            expect(_isMutable).to.eq(isMutable)
            // Get token metadata update authority's public key
            const _updateAuthority = await callSPLTokenProgram.getMetadataUpdateAuthority(tokenMintInBytes)
            expect(_updateAuthority).to.eq(contractPublicKeyInBytes)
        })

        it('Create a second token metadata account associated with the same token mint (reverts)', async function() {
            await expect(callSPLTokenProgram.connect(deployer).createTokenMetadataAccount(
                Buffer.from(seed), // Seed that was used to create SPL token mint account
                tokenName,
                tokenSymbol,
                uri,
                isMutable
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'MetadataAlreadyExists').withArgs(
                await callSPLTokenProgram.getTokenMintAccount(deployer, Buffer.from(seed)),
                await callSPLTokenProgram.getMetadataPDA(
                    await callSPLTokenProgram.getTokenMintAccount(deployer, Buffer.from(seed))
                ),
            )
        })

        it('Derive token metadata PDA on-chain', async function() {
            // Derive metadata PDA using Metaplex SDK
            const umi = createUmi(config.svm_node[globalOptions.network])
            const metadataPDAFromSDK = findMetadataPda(
                umi,
                { mint: publicKey(ethers.encodeBase58(tokenMintInBytes)) }
            )[0]
            // Derive metadata PDA on-chain
            const metadataPDA = await callSPLTokenProgram.getMetadataPDA(tokenMintInBytes)
            // Derived PDAs should match
            expect(ethers.encodeBase58(metadataPDA)).to.eq(metadataPDAFromSDK)
        })

        it("Calculate Metaplex 'create' fee for token metadata accounts", async function() {
            const metaplexCreateFee = await callSPLTokenProgram.getMetaplexCreateFee()
            expect(metaplexCreateFee).to.eq(BigInt('10000000')) // See: https://developers.metaplex.com/protocol-fees
        })

        it('Create token metadata account for a non existent token mint (transaction reverts)', async function() {
            await expect(callSPLTokenProgram.connect(deployer).createTokenMetadataAccount(
                Buffer.from("seed"), // Seed that was not used to create a SPL token mint account
                tokenName,
                tokenSymbol,
                uri,
                isMutable
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'TokenMintDataQuery')
        })

        it('Create token metadata account for a token mint with invalid MINT authority (transaction reverts)', async function() {
            // Create and initialize new SPL token mint (CallSPLTokenProgram contract will have MINT authority over created token mint)
            tx = await callSPLTokenProgram.connect(deployer).createInitializeTokenMint(
                Buffer.from(second_seed), // Seed to generate new SPL token mint account on-chain
                decimals, // Decimals value for the new SPL token to be created on Solana
            )
            await tx.wait(1) // Wait for 1 confirmation
            otherTokenMintInBytes =  await callSPLTokenProgram.getTokenMintAccount(deployer.address, Buffer.from(second_seed))
            // CallMetaplexProgram does not have MINT authority over the token mint
            await expect(callMetaplexProgram.connect(deployer).createTokenMetadataAccount(
                Buffer.from(second_seed),
                tokenName,
                tokenSymbol,
                uri,
                isMutable
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'TokenMintDataQuery')
        })

        it('Create token metadata account with invalid token name (transaction reverts)', async function() {
            let _tokenName = "My very long token name which will definitely not fit within the allowed 32 characters length"
            await expect(callSPLTokenProgram.connect(deployer).createTokenMetadataAccount(
                Buffer.from(second_seed),
                _tokenName,
                tokenSymbol,
                uri,
                isMutable
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'InvalidTokenMetadata')
        })

        it('Create token metadata account with invalid token symbol (transaction reverts)', async function() {
            let _tokenSymbol = "I_COULD_NOT_THINK_OF_A_SHORTER_SYMBOL_FOR_MY_TOKEN"
            await expect(callSPLTokenProgram.connect(deployer).createTokenMetadataAccount(
                Buffer.from(second_seed),
                tokenName,
                _tokenSymbol,
                uri,
                isMutable
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'InvalidTokenMetadata')
        })

        it('Create token metadata account with invalid uri (transaction reverts)', async function() {
            let _uri = "https://www.my-awesome-token-uri.com/info?my_awesome_token_symbol=I_COULD_NOT_TH"
            + "INK_OF_A_SHORTER_SYMBOL_FOR_MY_TOKEN&my_awesome_token_name=My-very-long-token-name-which-will-definitely"
            + "-not-fit-within-the-allowed-32-characters-length&language=south-korean-with-a-chinese-accent&request_id="
            + "12345678909876543212345678909876543212345678909876543212345678909876543212345678909876543212345678909876"
            await expect(callSPLTokenProgram.connect(deployer).createTokenMetadataAccount(
                Buffer.from(second_seed),
                tokenName,
                tokenSymbol,
                _uri,
                isMutable
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'InvalidTokenMetadata')
        })

        it('Update token metadata', async function() {
            tx = await callSPLTokenProgram.connect(deployer).updateTokenMetadataAccount(
                Buffer.from(seed), // Seed that was used to create SPL token mint account
                "Update",
                "UPDATE",
                "https://my-updated_test-token.fi/logo.png",
                ZERO_BYTES32, // No new update authority provided
                true // isMutable
            )
            await tx.wait(1) // Wait for 1 confirmation

            // Get updated token metadata
            const metadata = await callSPLTokenProgram.getTokenMetadata(tokenMintInBytes)
            expect(metadata[0].split("\x00")[0]).to.eq("Update")
            expect(metadata[1].split("\x00")[0]).to.eq("UPDATE")
            expect(metadata[2].split("\x00")[0]).to.eq("https://my-updated_test-token.fi/logo.png")
            expect(metadata[3]).to.eq(true)
            expect(metadata[4]).to.eq(contractPublicKeyInBytes) // Update authority is unchanged
            // Get token name
            const _tokenName = (await callSPLTokenProgram.getTokenName(tokenMintInBytes)).split("\x00")[0]
            expect(_tokenName).to.eq("Update")
            // Get token symbol
            const _tokenSymbol = (await callSPLTokenProgram.getTokenSymbol(tokenMintInBytes)).split("\x00")[0]
            expect(_tokenSymbol).to.eq("UPDATE")
            // Get uri
            const _uri = (await callSPLTokenProgram.getUri(tokenMintInBytes)).split("\x00")[0]
            expect(_uri).to.eq("https://my-updated_test-token.fi/logo.png")
            // Get isMutable flag
            const _isMutable = await callSPLTokenProgram.getMetadataIsMutable(tokenMintInBytes)
            expect(_isMutable).to.eq(true)
            // Get token metadata update authority's public key
            const _updateAuthority = await callSPLTokenProgram.getMetadataUpdateAuthority(tokenMintInBytes)
            expect(_updateAuthority).to.eq(contractPublicKeyInBytes)
        })

        it("Update metadata account's UPDATE authority", async function() {
            tx = await callSPLTokenProgram.connect(deployer).updateTokenMetadataAccount(
                Buffer.from(seed), // Seed that was used to create SPL token mint account
                "Update",
                "UPDATE",
                "https://my-updated-test-token.fi/logo.png",
                newUpdateAuthorityInBytes, // Provide new update authority
                true // isMutable
            )
            await tx.wait(1) // Wait for 1 confirmation

            // Get updated token metadata
            const metadata = await callSPLTokenProgram.getTokenMetadata(tokenMintInBytes)
            expect(metadata[0].split("\x00")[0]).to.eq("Update")
            expect(metadata[1].split("\x00")[0]).to.eq("UPDATE")
            expect(metadata[2].split("\x00")[0]).to.eq("https://my-updated-test-token.fi/logo.png")
            expect(metadata[3]).to.eq(true)
            expect(metadata[4]).to.eq("0x" + newUpdateAuthorityInBytes.toString('hex')) // Update authority is unchanged
            // Get token name
            const _tokenName = (await callSPLTokenProgram.getTokenName(tokenMintInBytes)).split("\x00")[0]
            expect(_tokenName).to.eq("Update")
            // Get token symbol
            const _tokenSymbol = (await callSPLTokenProgram.getTokenSymbol(tokenMintInBytes)).split("\x00")[0]
            expect(_tokenSymbol).to.eq("UPDATE")
            // Get uri
            const _uri = (await callSPLTokenProgram.getUri(tokenMintInBytes)).split("\x00")[0]
            expect(_uri).to.eq("https://my-updated-test-token.fi/logo.png")
            // Get isMutable flag
            const _isMutable = await callSPLTokenProgram.getMetadataIsMutable(tokenMintInBytes)
            expect(_isMutable).to.eq(true)
            // Get token metadata update authority's public key
            const _updateAuthority = await callSPLTokenProgram.getMetadataUpdateAuthority(tokenMintInBytes)
            expect(_updateAuthority).to.eq("0x" + newUpdateAuthorityInBytes.toString('hex'))
        })

        it("Update metadata account with invalid UPDATE authority (reverts)", async function() {
             await expect(callSPLTokenProgram.connect(deployer).updateTokenMetadataAccount(
                Buffer.from(seed), // Seed that was used to create SPL token mint account
                "New update",
                "NEW_UPDATE",
                "https://my-new-updated-test-token.fi/logo.png",
                ZERO_BYTES32, // No new update authority provided
                true // isMutable
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'InvalidUpdateAuthority').withArgs(
                 await callSPLTokenProgram.getMetadataPDA(
                     await callSPLTokenProgram.getTokenMintAccount(deployer, Buffer.from(seed))
                 ),
                 newUpdateAuthorityInBytes,
                 contractPublicKeyInBytes
             )
        })

        it("Update metadata account to be immutable", async function() {
            // Create and initialize new SPL token mint
            tx = await callSPLTokenProgram.connect(deployer).createInitializeTokenMint(
                Buffer.from(third_seed), // Seed to generate new SPL token mint account on-chain
                decimals, // Decimals value for the new SPL token to be created on Solana
            )
            await tx.wait(1) // Wait for 1 confirmation
            tokenMintInBytes =  await callSPLTokenProgram.getTokenMintAccount(deployer.address, Buffer.from(third_seed))
            // Create metadata account
            tx = await callSPLTokenProgram.connect(deployer).createTokenMetadataAccount(
                Buffer.from(third_seed), // Seed that was used to create SPL token mint account
                tokenName,
                tokenSymbol,
                uri,
                isMutable
            )
            await tx.wait(1) // Wait for 1 confirmation
            // Update metadata account to be immutable
            tx = await callSPLTokenProgram.connect(deployer).updateTokenMetadataAccount(
                Buffer.from(third_seed), // Seed that was used to create SPL token mint account
                tokenName,
                tokenSymbol,
                uri,
                ZERO_BYTES32, // No new update authority provided
                false // isMutable
            )
            await tx.wait(1) // Wait for 1 confirmation

            // Get updated token metadata
            const metadata = await callSPLTokenProgram.getTokenMetadata(tokenMintInBytes)
            expect(metadata[0].split("\x00")[0]).to.eq(tokenName)
            expect(metadata[1].split("\x00")[0]).to.eq(tokenSymbol)
            expect(metadata[2].split("\x00")[0]).to.eq(uri)
            expect(metadata[3]).to.eq(false)
            expect(metadata[4]).to.eq(contractPublicKeyInBytes)
            // Get token name
            const _tokenName = (await callSPLTokenProgram.getTokenName(tokenMintInBytes)).split("\x00")[0]
            expect(_tokenName).to.eq(tokenName)
            // Get token symbol
            const _tokenSymbol = (await callSPLTokenProgram.getTokenSymbol(tokenMintInBytes)).split("\x00")[0]
            expect(_tokenSymbol).to.eq(tokenSymbol)
            // Get uri
            const _uri = (await callSPLTokenProgram.getUri(tokenMintInBytes)).split("\x00")[0]
            expect(_uri).to.eq(uri)
            // Get isMutable flag
            const _isMutable = await callSPLTokenProgram.getMetadataIsMutable(tokenMintInBytes)
            expect(_isMutable).to.eq(false)
            // Get token metadata update authority's public key
            const _updateAuthority = await callSPLTokenProgram.getMetadataUpdateAuthority(tokenMintInBytes)
            expect(_updateAuthority).to.eq(contractPublicKeyInBytes)
        })

        it("Update immutable metadata account (reverts)", async function() {
            await expect(callSPLTokenProgram.connect(deployer).updateTokenMetadataAccount(
                Buffer.from(third_seed), // Seed that was used to create SPL token mint account
                "Update",
                "UPDATE",
                "https://my-immutable-test-token.fi/logo.png",
                ZERO_BYTES32, // No new update authority provided
                true // isMutable
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'ImmutableMetadata').withArgs(
                await callSPLTokenProgram.getTokenMintAccount(deployer, Buffer.from(third_seed))
            )
        })

        it('Update a non existent token metadata account for a non existent token mint (transaction reverts)', async function() {
            await expect(callSPLTokenProgram.connect(deployer).updateTokenMetadataAccount(
                Buffer.from("seed"), // Seed that was not used to create a SPL token mint account
                "Update",
                "UPDATE",
                "https://my-imaginary-test-token.fi/logo.png",
                ZERO_BYTES32, // No new update authority provided
                true // isMutable
            )).to.be.revertedWithCustomError(callSPLTokenProgram, 'MetadataAccountDataQuery')
        })
    })
})
