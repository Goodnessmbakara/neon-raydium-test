import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers"
import {
    setSecretTask,
    getSecretTask,
    listSecretsTask,
    deleteSecretTask,
    displayKeystoreFilePathTask,
    isSecretSetTask,
    askPasswordTask,
    decryptSecretTask
} from "./custom-tasks.js"

const config = {
  plugins: [hardhatToolboxMochaEthersPlugin],
  tasks: [
    setSecretTask,
    getSecretTask,
    listSecretsTask,
    deleteSecretTask,
    displayKeystoreFilePathTask,
    isSecretSetTask,
    askPasswordTask,
    decryptSecretTask
  ],
  solidity: {
    compilers:[
      {
        version: '0.8.28',
        settings: {
          evmVersion: "cancun",
          viaIR: true,
          optimizer: {
              enabled: true,
              runs: 200
          }
        }
      }
    ]
  },
  docgen: {
    path: './docs',
    pages: 'files',
    clear: true,
    runOnCompile: true
  },
  etherscan: {
    apiKey: {
      neonevm: "test"
    },
    customChains: [
      {
        network: "neonevm",
        chainId: 245022926,
        urls: {
          apiURL: "https://devnet-api.neonscan.org/hardhat/verify",
          browserURL: "https://devnet.neonscan.org"
        }
      },
      {
        network: "neonevm",
        chainId: 245022934,
        urls: {
          apiURL: "https://api.neonscan.org/hardhat/verify",
          browserURL: "https://neonscan.org"
        }
      }
    ]
  },
  networks: {
    curvestand: {
      type: "http",
      chainType: "generic",
      url: "https://curve-stand.neontest.xyz",
      accounts: [],
      allowUnlimitedContractSize: false,
      gasMultiplier: 2,
      maxFeePerGas: 10000,
      maxPriorityFeePerGas: 5000
    },
    neondevnet: {
      type: "http",
      chainType: "generic",
      url: "https://devnet.neonevm.org",
      accounts: [],
      chainId: 245022926,
      allowUnlimitedContractSize: false,
      gasMultiplier: 2,
      maxFeePerGas: '10000000000000',
      maxPriorityFeePerGas: '5000000000000',
      timeout: 600000,
      retries: 10,
      verify: {
        etherscan: {
          apiKey: "test"
        }
      },
      httpHeaders: {
        "Content-Type": "application/json"
      },
      gas: "auto",
      gasPrice: "auto",
      confirmations: 1,
      pollingInterval: 2000
    },
    neonmainnet: {
      type: "http",
      chainType: "generic",
      url: "https://neon-proxy-mainnet.solana.p2p.org",
      accounts: [],
      chainId: 245022934,
      allowUnlimitedContractSize: false,
      gas: "auto",
      gasPrice: "auto"
    }
  },
  mocha: {
    timeout: 5000000
  }
}

export default config
