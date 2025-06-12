# Neon EVM contracts

This repository is a set of various contracts and integrations that aim to help developers building on Neon EVM.

### Integrations on Neon EVM
* [ERC20ForSPL & ERC20ForSPLFactory](contracts/token/ERC20ForSpl)
* [Solidity libraries to interact with Solana](contracts/composability)
* [Pyth oracle](contracts/oracles/Pyth)
* [Solana VRF](contracts/oracles/SolanaVRF)

### Precompiles on Neon EVM
Neon EVM provides a set of custom precompiles which are built to connect Solidity developers with Solana. The list of the precompiles and their code can be found [here](contracts/precompiles).

### Helpers
Helper libraries which could be used to prepare and validate data being passed to and return from Solana can be found [here](contracts/utils).

### Secret values setup
Secret values (such as private keys) used in tests and scripts should be stored using Hardhat's encrypted keystore file. 
This keystore file is specific to this _Hardhat_ project, you can run the following command in the CLI to display the 
keystore file path for this _Hardhat_ project: 

```shell
npx hardhat keystore path
```

To store encrypted secret values into this project's Hardhat keystore file, run the following commands in the CLI:

```shell
npx hardhat keystore set PRIVATE_KEY_OWNER
```
```shell
npx hardhat keystore set PRIVATE_KEY_USER_1
```
```shell
npx hardhat keystore set PRIVATE_KEY_USER_2
```
```shell
npx hardhat keystore set PRIVATE_KEY_USER_3
```
```shell
npx hardhat keystore set PRIVATE_KEY_SOLANA
```
```shell
npx hardhat keystore set PRIVATE_KEY_SOLANA_2
```
```shell
npx hardhat keystore set PRIVATE_KEY_SOLANA_3
```
```shell
npx hardhat keystore set PRIVATE_KEY_SOLANA_4
```

You will be asked to choose a password (which will be used to encrypt provided secrets) and to enter the secret values
to be encrypted. The keystore password can be added to the `.env` file (as `KEYSTORE_PASSWORD`)  which allows secrets
to be decrypted automatically when running Hardhat tests and scripts. Otherwise, each running Hardhat test and script
will have the CLI prompt a request to enter the keystore password manually.

> [!CAUTION]
> Although it is not recommended (as it involves risks of leaking secrets) it is possible to store plain-text secrets in
`.env` file using the same keys as listed above. When doing so, user will be asked to confirm wanting to use plain-text
secrets found in `.env` file when running Hardhat tests and scripts.

# Week 5: Raydium Composability Implementation

## Project Overview
This week, I implemented and tested the Raydium composability features on Neon EVM Devnet. The implementation focuses on creating and managing Raydium pools, handling liquidity operations, and executing token swaps.

## Implementation Details

### 1. Test Execution
```bash
DEBUG=hardhat:*,hardhat-ethers:* npx hardhat test ./test/composability/raydium.test.js --network neondevnet
```

### 2. Contract Deployment
Successfully deployed the Raydium Program contract:
- **CallRaydiumProgram**: `0x4C40C0d12E281DA0F11DEc56DA1901053B75e4BF`
  - [Deployment Transaction](https://neon-devnet.blockscout.com/tx/0x3dce1978f5c0f722ec1590286f4a77808b19419bd336ae975399012e08e58512)

### 3. Test Environment Setup
- Network: Neon EVM Devnet
- Chain ID: 245022926
- Node Version: v20.19.2 (Note: Upgrade to v22.10.0 recommended)
- Hardhat Version: 3.0.0-next.14

### 4. Test Accounts
- Owner: `0x40a2Aa83271dd2F86e7C50C05b60bf3873bA4461`
- User1: `0xEdC571996120538dB0F06AEfE5ed0c6bfa70BfB0`
- Solana User1: `4de59aRfCH6MQPRktbMrKmrLCrQm5Rfsf4bU4Gyrtc6x`

### 5. Raydium Pool Operations
Successfully tested the following operations:

1. **Pool Creation**
   - Created pool with WSOL and custom token
   - Pool ID: `0x45f8f3a0b589a75c6c5b95a9f606e652458709c116eed99b24f1c3432a18e41a`
   - [Transaction](https://neon-devnet.blockscout.com/tx/0x3dce1978f5c0f722ec1590286f4a77808b19419bd336ae975399012e08e58512)

2. **Liquidity Management**
   - Added liquidity: [Transaction](https://neon-devnet.blockscout.com/tx/0x79432db3389ce9c30ac51ba6cf9bedf61d45f016c729ab19abd6fff6173b94bf)
   - Withdrew liquidity: [Transaction](https://neon-devnet.blockscout.com/tx/0xd36d10099b8b575869e3e1b04efd055f4c897018b887335200ca239ce8c002fe)
   - Locked liquidity with metadata: [Transaction](https://neon-devnet.blockscout.com/tx/0x5a1f56a358a85c53b9f426a6e75e3e9efedee0a043498cf2416b80d617e12dac)

3. **Swap Operations**
   - Input swap: [Transaction](https://neon-devnet.blockscout.com/tx/0x2220624710eabaf6ba3be1879e91a729bb1e7927394d694f415ed361c62a6c88)
   - Output swap: [Transaction](https://neon-devnet.blockscout.com/tx/0xc713c011d7e9193d3906994e78ab900dda97e16c69840cc7adf744317ee9c376)
   - Fee collection: [Transaction](https://neon-devnet.blockscout.com/tx/0x274f0701b1d3a17b1b82a6d72c0ca1f2a499da4e87e4d778f5ebd634276fb213)

### 6. Test Results
Successfully ran 8 tests covering all core functionalities:
- Pool creation and configuration
- Liquidity provision and withdrawal
- Token swaps (input and output)
- Fee collection
- LP token management

Test duration: 11 minutes
All tests passed successfully

## Raydium Composability Use Case: Automated Market Maker (AMM) with Dynamic Fee Structure

### Concept
I propose implementing an AMM that dynamically adjusts fees based on pool utilization and market conditions. This would be particularly useful for managing liquidity in volatile market conditions.

### Key Features

1. **Dynamic Fee Structure**
   - Base fee: 0.3% (standard Raydium fee)
   - Additional fees based on:
     - Pool utilization rate
     - Price impact
     - Time since pool creation
   - Fees automatically adjust to maintain optimal liquidity

2. **Liquidity Management**
   - Automated liquidity provision
   - Gradual liquidity unlocking
   - Emergency liquidity withdrawal mechanism

3. **Price Impact Protection**
   - Maximum price impact limits
   - Slippage protection
   - Circuit breakers for extreme market conditions

### Implementation Approach

```solidity
contract DynamicFeeAMM {
    // Pool configuration
    struct PoolConfig {
        uint256 baseFee;
        uint256 utilizationMultiplier;
        uint256 timeMultiplier;
        uint256 maxPriceImpact;
    }
    
    // Dynamic fee calculation
    function calculateFee(
        uint256 amount,
        uint256 poolUtilization,
        uint256 timeSinceCreation
    ) public view returns (uint256) {
        uint256 baseFeeAmount = (amount * baseFee) / 10000;
        uint256 utilizationFee = (baseFeeAmount * poolUtilization * utilizationMultiplier) / 10000;
        uint256 timeFee = (baseFeeAmount * timeSinceCreation * timeMultiplier) / 10000;
        
        return baseFeeAmount + utilizationFee + timeFee;
    }
    
    // Liquidity management
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external {
        // Add liquidity with dynamic fee structure
        // Implement gradual unlocking mechanism
    }
}
```

### Benefits

1. **Improved Market Stability**
   - Reduced price impact during high volatility
   - Better liquidity distribution
   - Protection against market manipulation

2. **Enhanced User Experience**
   - Transparent fee structure
   - Predictable price impact
   - Automated liquidity management

3. **Risk Management**
   - Built-in circuit breakers
   - Emergency liquidity withdrawal
   - Price impact limits

### Technical Implementation

The implementation would leverage Raydium's existing pool infrastructure while adding:
- Custom fee calculation logic
- Liquidity management mechanisms
- Price impact monitoring
- Emergency controls

### Next Steps

1. **Development**
   - Implement core AMM logic
   - Add dynamic fee calculation
   - Integrate with Raydium pools

2. **Testing**
   - Unit tests for fee calculation
   - Integration tests with Raydium
   - Stress testing under various market conditions

3. **Deployment**
   - Deploy on Neon EVM Devnet
   - Test with real token pairs
   - Monitor performance and adjust parameters

## Resources

- [Neon EVM Documentation](https://docs.neon-labs.org)
- [Raydium Documentation](https://raydium.gitbook.io/raydium)
- [Solana Documentation](https://docs.solana.com)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This software is for educational purposes only. Use at your own risk. The contracts have not been audited and may contain vulnerabilities.