import hre from "hardhat"
import web3 from "@solana/web3.js"
import {
    getAssociatedTokenAddress,
    createInitializeMint2Instruction,
    TOKEN_PROGRAM_ID,
    MINT_SIZE,
    NATIVE_MINT,
    createMintToInstruction,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddressSync,
    createApproveInstruction,
    createSyncNativeInstruction
} from '@solana/spl-token'
import { Metaplex } from "@metaplex-foundation/js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import {
    createSignerFromKeypair,
    signerIdentity
} from "@metaplex-foundation/umi"
import { createMetadataAccountV3 } from "@metaplex-foundation/mpl-token-metadata"
import { Buffer } from "buffer"
import config from "../config"

const ethers = (await hre.network.connect()).ethers;
const solanaConnection = new web3.Connection(config.svm_node[hre.globalOptions.network], "processed")
const umi = createUmi(config.svm_node[hre.globalOptions.network])

export async function asyncTimeout(timeout) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), timeout)
    })
}

export function asyncForLoop(iterable, asyncCallback, index, result) {
    return new Promise(async (resolve, reject) => {
        try {
            if(index < iterable.length) {
                result = await asyncCallback(iterable, index, result)
                resolve(asyncForLoop(iterable, asyncCallback, index + 1, result))
            } else {
                resolve(result)
            }
        } catch(err) {
            reject(err)
        }
    })
}

export function asyncWhileLoop(isConditionFulfilled, asyncCallback, result) {
    return new Promise(async (resolve, reject) => {
        try {
            if(!isConditionFulfilled) {
                const { isConditionFulfilled: fulfilled, result: updatedResult } = await asyncCallback(result)
                resolve(asyncWhileLoop(fulfilled, asyncCallback, updatedResult))
            } else {
                resolve(result)
            }
        } catch(err) {
            reject(err)
        }
    })
}

export async function airdropNEON(address, amount) {
    const { network } = await import("hardhat");
    const ethers = (await network.connect()).ethers;
    
    const FAUCET_URL = "https://api.neonfaucet.org/request_neon";
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds
    
    let retryCount = 0;
    
    while (retryCount < MAX_RETRIES) {
        try {
            console.log(`\nAttempting to airdrop ${ethers.formatEther(amount)} NEON to ${address} (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            
            // Use the Neon Faucet API
            const response = await fetch(FAUCET_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    wallet: address,
                    amount: 100
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log("Airdrop response:", result);
            
            // Wait for transaction to be mined
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds for transaction to be mined
            
            // Verify balance
            const balance = await ethers.provider.getBalance(address);
            console.log("Current balance:", ethers.formatEther(balance), "NEON");
            
            return true;
        } catch (error) {
            console.error(`Airdrop attempt ${retryCount + 1} failed:`, error.message || error);
            retryCount++;
            
            if (retryCount < MAX_RETRIES) {
                console.log(`Waiting ${RETRY_DELAY/1000} seconds before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
        }
    }
    
    console.warn(`⚠️ Failed to airdrop NEON after ${MAX_RETRIES} attempts. Continuing with test execution...`);
    return false;
}

export async function airdropSOL(recipientPubKey, solAmount) {
    if(solAmount > 0) {
        const params = [recipientPubKey, solAmount]
        const res = await fetch(config.svm_node[hre.globalOptions.network], {
            method: 'POST',
            body: JSON.stringify({"jsonrpc": "2.0", "id": 1, "method": "requestAirdrop", "params": params}),
            headers: {'Content-Type': 'application/json'}
        })
        console.log("\nAirdropping " + ethers.formatUnits(solAmount.toString(), 9) + " SOL to " + recipientPubKey)
        if (res.status !== 200) {
            console.warn("\nAirdrop request failed: " + JSON.stringify(res))
        }
        let accountBalance = BigInt(0)
        await asyncWhileLoop(
            accountBalance >= solAmount, // condition to fulfill
            async () => {
                await asyncForLoop(1000)
                accountBalance = await solanaConnection.getBalance(recipientPubKey)
                return ({
                    isConditionFulfilled: accountBalance >= solAmount,
                    result: null
                })
            },
            null
        )
        // console.log("\nNew account balance: ", accountBalance)
    }
}

export async function deployContract(deployer, user, contractName, contractAddress = null) {
    const { network } = await import("hardhat");
    const ethers = (await network.connect()).ethers;
    
    console.log("\n🔍 Starting contract deployment process...");
    
    // Get minimum required balance
    const minBalance = ethers.parseEther("100.0");
    console.log("Minimum required balance:", ethers.formatEther(minBalance), "NEON");
    
    // Check deployer balance
    const deployerBalance = await ethers.provider.getBalance(deployer.address);
    console.log("Deployer current balance:", ethers.formatEther(deployerBalance), "NEON");
    
    // Check user balance
    const userBalance = await ethers.provider.getBalance(user.address);
    console.log("User current balance:", ethers.formatEther(userBalance), "NEON");
    
    // Create other user
    const otherUser = ethers.Wallet.createRandom();
    console.log("Created other user with address:", otherUser.address);
    
    // Airdrop NEON to other user if needed
    if (await ethers.provider.getBalance(otherUser.address) < minBalance) {
        console.log("\nAirdropping 100 NEON to", otherUser.address);
        try {
            await airdropNEON(otherUser.address, ethers.parseEther("100.0"));
        } catch (error) {
            console.warn("⚠️ Airdrop failed but continuing with test execution:", error.message || error);
        }
    }
    
    console.log("\n📦 Getting contract factory for:", contractName);
    const contractFactory = await ethers.getContractFactory(contractName, deployer);
    let contract;
    
    if(contractName.split(':').length > 1) {
        contractName = contractName.split(':')[contractName.split(':').length - 1];
        console.log("Using contract name:", contractName);
    }
    
    if (!contractAddress) {
        console.log("\n🚀 Deploying new contract instance...");
        console.log("Deployer address:", deployer.address);
        
        try {
            contract = await contractFactory.deploy();
            console.log("Contract deployment transaction sent, waiting for deployment...");
            await contract.waitForDeployment();
            console.log("\n✅ Contract deployed successfully to:", contract.target);
        } catch (error) {
            console.error("\n❌ Contract deployment failed:", error);
            throw error;
        }
    } else {
        console.log("\n📎 Using existing contract at:", contractAddress);
        contract = contractFactory.attach(contractAddress);
    }

    return { deployer, user, otherUser, contract };
}

export async function getSolanaTransactions(neonTxHash) {
    return await fetch(hre.userConfig.networks[hre.globalOptions.network].url, neonTxHash, {
        method: 'POST',
        body: JSON.stringify({
            "jsonrpc":"2.0",
            "method":"neon_getSolanaTransactionByNeonTransaction",
            "params":[neonTxHash],
            "id":1
        }),
        headers: { 'Content-Type': 'application/json' }
    })
}

export async function executeSolanaInstruction(instruction, lamports, contractInstance, salt, msgSender) {
    if (salt === undefined) {
        salt = '0x0000000000000000000000000000000000000000000000000000000000000000';
    }

    const tx = await contractInstance.connect(msgSender).execute(
        lamports,
        salt,
        prepareInstruction(instruction)
    );

    const receipt = await tx.wait(3);
    return [tx, receipt];
}

export function prepareInstructionAccounts(instruction, overwriteAccounts) {
    let encodeKeys = '';
    for (let i = 0, len = instruction.keys.length; i < len; ++i) {
        if (typeof(overwriteAccounts) != "undefined" && Object.hasOwn(overwriteAccounts, i)) {
            // console.log(publicKeyToBytes32(overwriteAccounts[i].key), 'publicKey');
            encodeKeys+= ethers.solidityPacked(["bytes32"], [publicKeyToBytes32(overwriteAccounts[i].key)]).substring(2);
            encodeKeys+= ethers.solidityPacked(["bool"], [overwriteAccounts[i].isSigner]).substring(2);
            encodeKeys+= ethers.solidityPacked(["bool"], [overwriteAccounts[i].isWritable]).substring(2);
        } else {
            // console.log(publicKeyToBytes32(instruction.keys[i].pubkey.toString()), 'publicKey');
            encodeKeys+= ethers.solidityPacked(["bytes32"], [publicKeyToBytes32(instruction.keys[i].pubkey.toString())]).substring(2);
            encodeKeys+= ethers.solidityPacked(["bool"], [instruction.keys[i].isSigner]).substring(2);
            encodeKeys+= ethers.solidityPacked(["bool"], [instruction.keys[i].isWritable]).substring(2);
        }
    }

    return '0x' + ethers.zeroPadBytes(ethers.toBeHex(instruction.keys.length), 8).substring(2) + encodeKeys;
}

export function prepareInstructionData(instruction) {
    const packedInstructionData = ethers.solidityPacked(
        ["bytes"],
        [instruction.data]
    ).substring(2);
    // console.log(packedInstructionData, 'packedInstructionData');

    return '0x' + ethers.zeroPadBytes(ethers.toBeHex(instruction.data.length), 8).substring(2) + packedInstructionData;
}

export function prepareInstruction(instruction) {
    return publicKeyToBytes32(instruction.programId.toBase58()) + prepareInstructionAccounts(instruction).substring(2) + prepareInstructionData(instruction).substring(2);
}

export function publicKeyToBytes32(pubkey) {
    return ethers.zeroPadValue(ethers.toBeHex(ethers.decodeBase58(pubkey)), 32);
}

export async function setupSPLTokens(keypair) {
    const _keypair = umi.eddsa.createKeypairFromSecretKey(keypair.secretKey)
    const authority = createSignerFromKeypair(umi, _keypair);
    const authorityPubkey = new web3.PublicKey(authority.publicKey.toString())

    if (await solanaConnection.getBalance(authorityPubkey) < 0.05 * 10 ** 9) {
        console.error('Provided Solana wallet needs at least 0.05 SOL to perform the test.');
        process.exit();
    }

    const seed = 'seed' + Date.now().toString(); // random seed on each script call
    const createWithSeed = await web3.PublicKey.createWithSeed(authorityPubkey, seed, new web3.PublicKey(TOKEN_PROGRAM_ID));
    console.log(createWithSeed, 'createWithSeed');

    let tokenAta = await getAssociatedTokenAddress(
        createWithSeed,
        authorityPubkey,
        true
    );
    console.log(tokenAta, 'tokenAta');

    let wsolAta = await getAssociatedTokenAddress(
        NATIVE_MINT,
        authorityPubkey,
        true
    );
    console.log(wsolAta, 'wsolAta');

    let tx = new web3.Transaction();

    // SOL -> wSOL
    tx.add(
        web3.SystemProgram.transfer({
            fromPubkey: authorityPubkey,
            toPubkey: wsolAta,
            lamports: 50000000 // 0.05 SOL
        }),
        createSyncNativeInstruction(wsolAta)
    );

    // create tokenA
    tx.add(
        web3.SystemProgram.createAccountWithSeed({
            fromPubkey: authorityPubkey,
            basePubkey: authorityPubkey,
            newAccountPubkey: createWithSeed,
            seed: seed,
            lamports: await solanaConnection.getMinimumBalanceForRentExemption(MINT_SIZE),
            space: MINT_SIZE,
            programId: new web3.PublicKey(TOKEN_PROGRAM_ID)
        })
    );

    tx.add(
        createInitializeMint2Instruction(
            createWithSeed,
            9, // decimals
            authorityPubkey,
            authorityPubkey,
        )
    );

    const metaplex = new Metaplex(solanaConnection);
    const metadata = metaplex.nfts().pdas().metadata({ mint: createWithSeed });
    umi.use(signerIdentity(authority));
    const ix = createMetadataAccountV3(
        umi,
        {
            metadata: metadata,
            mint: createWithSeed,
            mintAuthority: authorityPubkey,
            payer: authorityPubkey,
            updateAuthority: authorityPubkey,
            data: {
                name: "Dev Neon EVM 2",
                symbol: "devNEON 2",
                uri: 'https://ipfs.io/ipfs/QmW2JdmwWsTVLw1Gx4ympCn1VHJiuojfNLS5ZNLEPcBd5x/doge.json',
                sellerFeeBasisPoints: 0,
                collection: null,
                creators: null,
                uses: null
            },
            isMutable: true,
            collectionDetails: null
        }
    ).getInstructions()[0]
    const keys = []
    ix.keys.forEach((_key) => {
        const key = {}
        key.isSigner= _key.isSigner
        key.isWritable= _key.isWritable
        key.pubkey = new web3.PublicKey(_key.pubkey)
        keys.push(key)
    })
    tx.add(
        new web3.TransactionInstruction({
            keys,
            programId: ix.programId,
            data: ix.data,
        })
    )

    tx.add(
        createAssociatedTokenAccountInstruction(
            authorityPubkey,
            tokenAta,
            authorityPubkey,
            createWithSeed
        )
    );

    tx.add(
        createMintToInstruction(
            createWithSeed,
            tokenAta,
            authorityPubkey,
            1500 * 10 ** 9 // mint 1500 tokens
        )
    );

    tx.add(
        web3.ComputeBudgetProgram.setComputeUnitLimit({ 
            units: 1400000 
        })
    );

    tx.add(
        web3.ComputeBudgetProgram.setComputeUnitPrice({ 
            microLamports: 100000
        })
    );

    await web3.sendAndConfirmTransaction(solanaConnection, tx, [keypair]);
    await asyncTimeout(3000);
    return createWithSeed.toBase58();
}

export async function setupATAAccounts(keypair, publicKey, tokenMintsArray) {
    console.log(tokenMintsArray, 'tokenMintsArray');
    let atasToBeCreated = '';
    const tx = new web3.Transaction();

    for (let i = 0, len = tokenMintsArray.length; i < len; ++i) {
        const associatedToken = getAssociatedTokenAddressSync(
            new web3.PublicKey(tokenMintsArray[i]), 
            new web3.PublicKey(publicKey), 
            true
        );
        const ataInfo = await solanaConnection.getAccountInfo(associatedToken);
        console.log(associatedToken, 'associatedToken');

        // create ATA only if it's missing
        if (!ataInfo || !ataInfo.data) {
            atasToBeCreated += tokenMintsArray[i] + ', ';

            tx.add(
                createAssociatedTokenAccountInstruction(
                    keypair.publicKey,
                    associatedToken,
                    new web3.PublicKey(publicKey),
                    new web3.PublicKey(tokenMintsArray[i])
                )
            );
        }
    }

    if (tx.instructions.length) {
        console.log('\nCreating ATA accounts for the following SPLTokens - ', atasToBeCreated.substring(0, atasToBeCreated.length - 2));
        const signature = await web3.sendAndConfirmTransaction(
            solanaConnection,
            tx,
            [keypair]
        );
        await asyncTimeout(3000);
    } else {
        return console.error('\nNo instructions included into transaction.');
    }
}

export function isValidHex(hex) {
    const isHexStrict = /^(0x)?[0-9a-f]*$/i.test(hex.toString());
    if (!isHexStrict) {
        throw new Error(`Given value "${hex}" is not a valid hex string.`);
    } else {
        return isHexStrict;
    }
}

export function calculatePdaAccount(prefix, tokenEvmAddress, salt, neonEvmProgram) {
    const neonContractAddressBytes = Buffer.from(isValidHex(tokenEvmAddress) ? tokenEvmAddress.replace(/^0x/i, '') : tokenEvmAddress, 'hex');
    const seed = [
        new Uint8Array([0x03]),
        new Uint8Array(Buffer.from(prefix, 'utf-8')),
        new Uint8Array(neonContractAddressBytes),
        Buffer.from(Buffer.concat([Buffer.alloc(12), Buffer.from(isValidHex(salt) ? salt.substring(2) : salt, 'hex')]), 'hex')
    ];

    return web3.PublicKey.findProgramAddressSync(seed, neonEvmProgram);
}

export async function approveSplTokens(keypair, tokenAMint, tokenBMint, ERC20ForSPL_A, ERC20ForSPL_B, owner) {
    const neon_getEvmParamsRequest = await fetch(hre.userConfig.networks[hre.globalOptions.network].url, {
        method: 'POST',
        body: JSON.stringify({"method":"neon_getEvmParams","params":[],"id":1,"jsonrpc":"2.0"}),
        headers: { 'Content-Type': 'application/json' }
    });
    const neon_getEvmParams = await neon_getEvmParamsRequest.json();
    console.log(neon_getEvmParams, 'neon_getEvmParams');

    const tx = new web3.Transaction();
    const delegatedPdaOwner_A = calculatePdaAccount(
        'AUTH',
        ERC20ForSPL_A.target,
        owner.address,
        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
    );

    const delegatedPdaOwner_B = calculatePdaAccount(
        'AUTH',
        ERC20ForSPL_B.target,
        owner.address,
        new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
    );

    let tokenA_ATA = await getAssociatedTokenAddress(
        new web3.PublicKey(tokenAMint),
        keypair.publicKey,
        true
    );

    let tokenB_ATA = await getAssociatedTokenAddress(
        new web3.PublicKey(tokenBMint),
        keypair.publicKey,
        true
    );

    tx.add(
        createApproveInstruction(
            tokenA_ATA,
            delegatedPdaOwner_A[0],
            keypair.publicKey,
            '18446744073709551615' // max uint64
        )
    );

    tx.add(
        createApproveInstruction(
            tokenB_ATA,
            delegatedPdaOwner_B[0],
            keypair.publicKey,
            '18446744073709551615' // max uint64
        )
    );

    tx.add(
        web3.ComputeBudgetProgram.setComputeUnitLimit({ 
            units: 1400000 
        })
    );

    tx.add(
        web3.ComputeBudgetProgram.setComputeUnitPrice({ 
            microLamports: 100000
        })
    );

    const signature = await web3.sendAndConfirmTransaction(
        solanaConnection,
        tx,
        [keypair]
    );
    await asyncTimeout(3000);
    return [tokenA_ATA.toBase58(), tokenB_ATA.toBase58()];
}
