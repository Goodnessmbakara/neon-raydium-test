import hre from "hardhat";
import web3 from "@solana/web3.js"
import {
    getAssociatedTokenAddress,
    createInitializeMint2Instruction,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    MINT_SIZE,
    createMintToInstruction,
    createAssociatedTokenAccountInstruction
} from '@solana/spl-token'
import { Metaplex } from "@metaplex-foundation/js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import {
    createSignerFromKeypair,
    signerIdentity
} from "@metaplex-foundation/umi"
import { createMetadataAccountV3 } from "@metaplex-foundation/mpl-token-metadata"
import { getSecrets } from "../../../neon-secrets.js";
import utils from '../utils'
import config from '../../config.js'
import "dotenv/config"

const connection = new web3.Connection(config.svm_node[hre.globalOptions.network], "processed");
const umi = createUmi(config.svm_node[hre.globalOptions.network])
const { wallets } = await getSecrets()
const keypair = wallets.solanaUser1;
console.log(keypair.publicKey.toBase58(), 'publicKey');
const _keypair = umi.eddsa.createKeypairFromSecretKey(keypair.secretKey)
const authority = createSignerFromKeypair(umi, _keypair);
const authorityPubkey = new web3.PublicKey(authority.publicKey.toString())

const solanaUser4 = wallets.solanaUser4; // Solana user with tokens balance for airdropping tokens

async function init() {
    if (await connection.getBalance(keypair.publicKey) == 0) {
        await utils.airdropSOL(keypair);
    }

    const seed = 'seed' + Date.now().toString(); // random seed on each script call
    const createWithSeed = await web3.PublicKey.createWithSeed(keypair.publicKey, seed, new web3.PublicKey(TOKEN_PROGRAM_ID));
    console.log(createWithSeed, 'SPLToken mint address');

    let keypairAta = await getAssociatedTokenAddress(
        createWithSeed,
        keypair.publicKey,
        false
    );

    let keypairAta4 = await getAssociatedTokenAddress(
        createWithSeed,
        solanaUser4.publicKey,
        false
    );

    let tx = new web3.Transaction();
    tx.add(
        web3.SystemProgram.createAccountWithSeed({
            fromPubkey: keypair.publicKey,
            basePubkey: keypair.publicKey,
            newAccountPubkey: createWithSeed,
            seed: seed,
            lamports: await connection.getMinimumBalanceForRentExemption(MINT_SIZE), // enough lamports to make the account rent exempt
            space: MINT_SIZE,
            programId: new web3.PublicKey(TOKEN_PROGRAM_ID) // programId
        })
    );

    tx.add(
        createInitializeMint2Instruction(
            createWithSeed, 
            9, // decimals
            keypair.publicKey,
            keypair.publicKey,
            new web3.PublicKey(TOKEN_PROGRAM_ID) // programId
        )
    );

    const metaplex = new Metaplex(connection);
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
                name: "Dev Neon EVM",
                symbol: "devNEON",
                uri: 'https://ipfs.io/ipfs/QmTZGs6GyUi3hTGtQiFNu4cYNMdMv4RS1XCyYVTQtjaXYF',
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
            keypair.publicKey,
            keypairAta,
            keypair.publicKey,
            createWithSeed,
            TOKEN_PROGRAM_ID, 
            ASSOCIATED_TOKEN_PROGRAM_ID
        )
    );

    tx.add(
        createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            keypairAta4,
            solanaUser4.publicKey,
            createWithSeed,
            TOKEN_PROGRAM_ID, 
            ASSOCIATED_TOKEN_PROGRAM_ID
        )
    );

    tx.add(
        createMintToInstruction(
            createWithSeed,
            keypairAta,
            keypair.publicKey,
            1500 * 10 ** 9 // mint 1500 tokens
        )
    );
    
    tx.add(
        createMintToInstruction(
            createWithSeed,
            keypairAta4,
            keypair.publicKey,
            1500 * 10 ** 9 // mint 1500 tokens
        )
    );

    await web3.sendAndConfirmTransaction(connection, tx, [keypair]);
    console.log('Transaction on Solana completed.');
    return;
}
init();