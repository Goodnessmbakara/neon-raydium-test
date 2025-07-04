import web3 from "@solana/web3.js"
import { globalOptions } from "hardhat"
import * as _ethers from "ethers"
import { createApproveInstruction, getAssociatedTokenAddress } from "@solana/spl-token"
import config from '../config.js'

const utils = {
    publicKeyToBytes32: function(pubkey) {
        return _ethers.zeroPadValue(_ethers.toBeHex(_ethers.decodeBase58(pubkey)), 32)
    },
    addressToBytes32: function(address) {
        return _ethers.zeroPadValue(_ethers.toBeHex(address), 32)
    },
    calculateContractAccount: function (contractEvmAddress, neonEvmProgram) {
        const neonContractAddressBytes = Buffer.from(this.isValidHex(contractEvmAddress) ? contractEvmAddress.replace(/^0x/i, '') : contractEvmAddress, 'hex')
        const seed = [
            new Uint8Array([0x03]),
            new Uint8Array(neonContractAddressBytes)
        ]

        return web3.PublicKey.findProgramAddressSync(seed, neonEvmProgram)
    },
    calculatePdaAccount: function (prefix, tokenEvmAddress, salt, neonEvmProgram) {
        const neonContractAddressBytes = Buffer.from(this.isValidHex(tokenEvmAddress) ? tokenEvmAddress.replace(/^0x/i, '') : tokenEvmAddress, 'hex')
        const seed = [
            new Uint8Array([0x03]),
            new Uint8Array(Buffer.from(prefix, 'utf-8')),
            new Uint8Array(neonContractAddressBytes),
            Buffer.from(Buffer.concat([Buffer.alloc(12), Buffer.from(this.isValidHex(salt) ? salt.substring(2) : salt, 'hex')]), 'hex')
        ]

        return web3.PublicKey.findProgramAddressSync(seed, neonEvmProgram)
    },
    isValidHex: function(hex) {
        const isHexStrict = /^(0x)?[0-9a-f]*$/i.test(hex.toString())
        if (!isHexStrict) {
            throw new Error(`Given value "${hex}" is not a valid hex string.`)
        } else {
            return isHexStrict
        }
    },
    toFixed: function(num, fixed) {
        let re = new RegExp('^-?\\d+(?:\.\\d{0,' + (fixed || -1) + '})?')
        return num.toString().match(re)[0]
    },
    asyncTimeout: async function(timeout) {
        return new Promise((resolve) => {
            setTimeout(() => resolve(), timeout)
        })
    },
    delegateSolana: async function delegateSolana(params, approveForScheduling) {
        // Get NeonEVM program Id
        const neon_getEvmParams = await fetch(params.curvestand, {
            method: 'POST',
            body: JSON.stringify({"method":"neon_getEvmParams","params":[],"id":1,"jsonrpc":"2.0"}),
            headers: { 'Content-Type': 'application/json' }
        })
        const neonEVMProgramId = (await neon_getEvmParams.json()).result.neonEvmProgramId

        // Calculate delegate's Ext Authority
        let delegateAuthorityPublicKey

        if (approveForScheduling != undefined && approveForScheduling == true) {
            delegateAuthorityPublicKey = this.calculateContractAccount(
                params.ERC20ForSPLContractAddress,
                new params.web3.PublicKey(neonEVMProgramId)
            )[0]
        } else {
            delegateAuthorityPublicKey = this.calculatePdaAccount(
                'AUTH',
                params.ERC20ForSPLContractAddress,
                params.delegateEVMAddress,
                new params.web3.PublicKey(neonEVMProgramId)
            )[0]
        }

        // Approve delegate
        const solanaTx = new params.web3.Transaction()
        solanaTx.add(
            createApproveInstruction(
                params.solanaApproverATA, // token account to be delegated
                delegateAuthorityPublicKey, // delegate
                params.solanaApprover.publicKey, // owner of token account to be delegated
                params.amount // amount to be delegated
            )
        )
        // let res = await web3.sendAndConfirmTransaction(connection, solanaTx, [payer, solanaApprover])
        // console.log(res)
        params.web3.sendAndConfirmTransaction(params.connection, solanaTx, [params.solanaApprover])
        return delegateAuthorityPublicKey
    },
    SolanaNativeHelper: {
        getPayer(svmKeypair) {
            return _ethers.dataSlice(_ethers.keccak256(svmKeypair.publicKey.toBytes()), 12, 32)
        },
        isValidHex: function(hex) {
            const isHexStrict = /^(0x)?[0-9a-f]*$/i.test(hex.toString())
            if (!isHexStrict) {
              throw new Error(`Given value "${hex}" is not a valid hex string.`)
            }
            return isHexStrict
        },
        hexToBuffer: function(hex) {
            const _hex = this.isValidHex(hex) ? hex.replace(/^0x/i, '') : hex
            return Buffer.from(_hex, 'hex')
        },
        numberToBuffer: function(size) {
            return Buffer.from([size])
        },
        stringToBuffer: function(str, encoding = 'utf8') {
            return Buffer.from(str, encoding)
        },
        toBytesLittleEndian: function(num, byteLength) {
            const buffer = Buffer.alloc(byteLength)
            buffer.writeBigUInt64LE(BigInt(num), 0)
            return buffer
        },
        toU256BE: function(bigIntNumber) {
            if (bigIntNumber < BigInt(0) || bigIntNumber > BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')) {
                throw new Error('Number out of range for U256BE')
            }

            const buffer = new ArrayBuffer(32) // 256 bits = 32 bytes
            const view = new DataView(buffer)

            // Loop through each byte and set it from the start to maintain big-endian order
            for (let i = 0; i < 32; i++) {
                // Extract each byte of the BigInt number
                const byte = Number((bigIntNumber >> BigInt(8 * (31 - i))) & BigInt(0xFF))
                view.setUint8(i, byte)
            }

            return new Uint8Array(buffer)
        },
        toBytesInt32: function(number, littleEndian = true) {
            const arrayBuffer = new ArrayBuffer(4) // an Int32 takes 4 bytes
            const dataView = new DataView(arrayBuffer)
            dataView.setUint32(0, number, littleEndian) // byteOffset = 0 litteEndian = false
            return arrayBuffer
        },
        neonBalanceProgramAddressSync: function(neonWallet, neonEvmProgram, chainId) {
            const neonWalletBuffer = this.hexToBuffer(neonWallet)
            const chainIdBytes = this.toU256BE(BigInt(chainId)) //chain_id as u256be
            const seed = [this.numberToBuffer(0x03), neonWalletBuffer, chainIdBytes]
            return web3.PublicKey.findProgramAddressSync(seed, neonEvmProgram)
        },
        neonTreeAccountAddressSync: function(neonWallet, neonEvmProgram, nonce, chainId) {
            const version = this.numberToBuffer(0x03)
            const tag = this.stringToBuffer('TREE')
            const address = this.hexToBuffer(neonWallet)
            const _chainId = this.toBytesLittleEndian(chainId, 8)
            const _nonce = this.toBytesLittleEndian(nonce, 8)
            const seed = [version, tag, address, _chainId, _nonce]
            return web3.PublicKey.findProgramAddressSync(seed, neonEvmProgram)
        },
        neonAuthorityPoolAddressSync: function(neonEvmProgram) {
            const seed = [this.stringToBuffer('Deposit')]
            return web3.PublicKey.findProgramAddressSync(seed, neonEvmProgram)
        },
        treasuryPoolAddressSync: function(neonEvmProgram, treasuryPoolIndex) {
            const a = this.stringToBuffer('treasury_pool')
            const b = Buffer.from(this.toBytesInt32(treasuryPoolIndex))
            return web3.PublicKey.findProgramAddressSync([a, b], neonEvmProgram)
        },
        serializedNode(childIndex, successLimit) {
            const gasLimit = toBytes64BE(BigInt(this.data.gasLimit), 32, 24)
            const value = toBytes64BE(BigInt(this.data.value == '0x' ? 0 : this.data.value), 32, 24)
            const index = toBytes16LE(childIndex, 2)
            const success = toBytes16LE(successLimit, 2)
            const hash = this.hexToBuffer(this.hash())
            return Buffer.concat([gasLimit, value, index, success, hash])
        },
        createScheduledTransactionInstruction: async function(node, instructionData) {
            const {
                neonEvmProgram: programId,
                signerAddress,
                balanceAddress,
                treeAccountAddress,
                associatedTokenAddress,
                treasuryPool,
                neonTransaction
            } = instructionData

            // airdrop SOLs to treasury
            const airdropSolsRequest = await fetch(node, {
                method: 'POST',
                body: JSON.stringify({"jsonrpc":"2.0", "id":1, "method":"requestAirdrop", "params": [treasuryPool.publicKey.toBase58(), 1000000000]}),
                headers: { 'Content-Type': 'application/json' }
            })
            const airdropSolsResponse = await airdropSolsRequest.json()

            const keys = [
                { pubkey: signerAddress, isSigner: true, isWritable: true },
                { pubkey: balanceAddress, isSigner: false, isWritable: true },
                { pubkey: treasuryPool.publicKey, isSigner: false, isWritable: true },
                { pubkey: treeAccountAddress, isSigner: false, isWritable: true },
                { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
                { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false }
            ]
            const type = this.numberToBuffer(0x4A)
            const count = Buffer.from(this.toBytesInt32(treasuryPool.index))
            const transaction = this.hexToBuffer(neonTransaction)
            return new web3.TransactionInstruction({
                keys,
                programId,
                data: Buffer.concat(
                    [type, count, transaction]
                )
            })
        },
        buildTransactionBody: async function(signerAddress, payer, nonce, chainId, target, callData) {
            if (parseInt(nonce, 16) == 0) {
                nonce = '0x'
            } else {
                nonce = _ethers.toBeHex(parseInt(nonce, 16))
            }

            let body =  {
                type: 0x7F,
                neonSubType: 0x01,
                data: {
                    payer: payer,
                    sender: '0x',
                    nonce: nonce,
                    index: '0x',
                    intent: '0x',
                    intentCallData: '0x',
                    target: target,
                    callData: callData,
                    value: '0x',
                    chainId: _ethers.toBeHex(parseInt(chainId, 16)),
                    gasLimit: _ethers.toBeHex(9999999),
                    maxFeePerGas: _ethers.toBeHex(50000000000),
                    maxPriorityFeePerGas: _ethers.toBeHex(10000000000)
                }
            }

            const result = []
            for (const property in body.data) {
                result.push(body.data[property])
            }

            return Buffer.concat([
                this.numberToBuffer([body.type]),
                this.numberToBuffer([body.neonSubType]),
                this.hexToBuffer(_ethers.encodeRlp(result))
            ]).toString('hex')
        },
        scheduleTransaction: async function(connection, neon_getEvmParams, svmKeypair, target, callData) {
            const payer = this.getPayer(svmKeypair)
            console.log(payer, 'payer')

            const signerAddress = svmKeypair.publicKey
            const eth_getTransactionCountRequest = await fetch(config.evm_sol_node[globalOptions.network], {
                method: 'POST',
                body: JSON.stringify({"method":"eth_getTransactionCount","params":[payer, "latest"],"id":1,"jsonrpc":"2.0"}),
                headers: { 'Content-Type': 'application/json' }
            })
            const nonce = (await eth_getTransactionCountRequest.json()).result
            console.log(nonce, 'nonce')

            const eth_chainIdRequest = await fetch(config.evm_sol_node[globalOptions.network], {
                method: 'POST',
                body: JSON.stringify({"method":"eth_chainId","params":[],"id":1,"jsonrpc":"2.0"}),
                headers: { 'Content-Type': 'application/json' }
            })
            const chainId = (await eth_chainIdRequest.json()).result

            const neonEvmProgram = new web3.PublicKey(neon_getEvmParams.result.neonEvmProgramId)
            const neonTransaction = await this.buildTransactionBody(
                signerAddress,
                payer,
                nonce,
                chainId,
                target,
                callData
            )

            const [balanceAddress] = this.neonBalanceProgramAddressSync(payer, neonEvmProgram, parseInt(chainId, 16))
            const [treeAccountAddress] = this.neonTreeAccountAddressSync(payer, neonEvmProgram, nonce, parseInt(chainId, 16))
            const [authorityPoolAddress] = this.neonAuthorityPoolAddressSync(neonEvmProgram)
            const associatedTokenAddress = await getAssociatedTokenAddress(new web3.PublicKey('So11111111111111111111111111111111111111112'), authorityPoolAddress, true)

            const index = Math.floor(Math.random() * neon_getEvmParams.result.neonTreasuryPoolCount) % neon_getEvmParams.result.neonTreasuryPoolCount
            const treasuryPool = {
                index: index,
                publicKey: this.treasuryPoolAddressSync(neonEvmProgram, index)[0]
            }

            let instruction = await this.createScheduledTransactionInstruction(
                config.svm_node[globalOptions.network],
                {
                    neonEvmProgram,
                    signerAddress,
                    balanceAddress,
                    treeAccountAddress,
                    associatedTokenAddress,
                    treasuryPool,
                    neonTransaction
                }
            )

            const transaction = new web3.Transaction()
            transaction.add(instruction)
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
            transaction.sign(...[svmKeypair])

            return await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false })
        }
    },
    airdropNEON: async function(address) {
        const postRequestNeons = await fetch('https://api.neonfaucet.org/request_neon', {
            method: 'POST',
            body: JSON.stringify({"amount": 100, "wallet": address}),
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Airdrop NEONs to', address);

        await this.asyncTimeout(1000);
    },
    airdropSOL: async function(account) {
        let postRequest = await fetch(config.svm_node[globalOptions.network], {
            method: 'POST',
            body: JSON.stringify({"jsonrpc":"2.0", "id":1, "method":"requestAirdrop", "params": [account.publicKey.toBase58(), 1000000000000]}),
            headers: { 'Content-Type': 'application/json' }
        })
        console.log('Airdrop SOLs to', account.publicKey.toBase58())

        await this.asyncTimeout(1000)
    }
}

export default utils
