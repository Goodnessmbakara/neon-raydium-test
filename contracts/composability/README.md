# Solidity libraries for NeonEVM composability

The composability feature allows dApps deployed on _NeonEVM_ to interact with _Solana_ programs, which involves 
formatting instructions in ways that are specific to each program.

Here we provide a set of **Solidity** libraries which make it possible to easily implement secure interactions with 
_Solana_'s **System**, **SPL Token** and **Raydium** programs.

> [!CAUTION]
> The following contracts have not been audited yet and are here for educational purposes.

## System program
<dl>
  <dd>

### CallSystemProgram contract
This contract demonstrates how the **LibSystemProgram** & **LibSystemData** libraries can be used in practice to interact with Solana's System program. [Link to SystemProgram Solidity libraries](./libraries/system-program/)
  </dd>
</dl>

## SPL Token program
<dl>
  <dd>

### CallSPLTokenProgram contract
This contract demonstrates how the **LibSPLTokenProgram** & **LibSPLTokenData** libraries can be used in practice to interact with Solana's SPL Token program. [Link to SPL Token Solidity libraries](./libraries/spl-token-program/)
  </dd>
</dl>

## Metaplex program
<dl>
  <dd>

### CallMetaplexProgram contract
This contract demonstrates how the **LibMetaplexProgram** & **LibMetaplexData** libraries can be used in practice to interact with Solana's Metaplex program. [Link to SPL Token Solidity libraries](./libraries/metaplex-program/)
  </dd>
</dl>

## Associated Token program
<dl>
  <dd>

### CallAssociatedTokenProgram contract
This contract demonstrates how the **LibAssociatedTokenProgram** & **LibAssociatedTokenData** libraries can be used in practice to interact with Solana's Associated Token program. [Link to Associated Token Solidity libraries](./libraries/associated-token-program/)
  </dd>
</dl>

## Raydium program
<dl>
  <dd>

### CallRaydiumProgram contract
This contract demonstrates how the **LibRaydiumProgram** & **LibRaydiumData** libraries can be used in practice to interact with Solana's Raydium program. [Link to Raydium Solidity libraries](./libraries/raydium-program/)
  </dd>
</dl>

### General information about how Solana Token accounts are handled

#### Associated token accounts vs Arbitrary token accounts

_Arbitrary token accounts_ are derived using a `seed` which includes the token account `owner`'s public key and an 
arbitrary `nonce` (among other parameters). By using different `nonce` values it is possible to derive different 
_arbitrary token accounts_ for the same `owner` which can be useful for some use cases.

The **CallSPLTokenProgram** contract provides its users with methods to create and initialize SPL _token mints_ and
_arbitrary token accounts_ as well as to mint and transfer tokens using those accounts. It features a built-in
authentication logic ensuring that users remain in control of created accounts.

However, there exists a canonical way of deriving a SPL token account for a specific `owner` and this token account is 
called an _Associated Token account_. _Associated Token accounts_ are used widely by application s running on _Solana_ 
and it is generally expected that token transfers are made to and from _Associated Token accounts_.

The **CallAssociatedTokenProgram** contract provides a method to create and initialize canonical _Associated Token
accounts_ for third party _Solana_ users. This method can also be used to create and initialize canonical _Associated
Token accounts_ owned by this contract.

#### Ownership and authentication

##### SPL token mint ownership and authentication

The `CallSPLTokenProgram.createInitializeTokenMint` function takes a `seed` parameter as input which is used along with 
`msg.sender` to derive the created token mint account. While the **CallSPLTokenProgram** contract is given mint/freeze 
authority on the created token mint account, the `mintTokens` function grants `msg.sender` permission to mint tokens
by providing the `seed` that was used to create the token mint account.

##### Metadata accounts ownership and authentication

The `CallMetaplexProgram.createTokenMetadataAccount` function takes a `seed` parameter as input which is used along with
`msg.sender` to derive a token mint account. Created token metadata account is associated with this token mint account 
which must have been created and initialized beforehand by the same `msg.sender`. That same `msg.sender` is also granted 
permission to update the token metadata account in the future, provided that it is set as mutable upon creation.

##### Arbitrary token accounts ownership and authentication

Using _arbitrary SPL Token accounts_ created via the `CallSPLTokenProgram` contract deployed on _NeonEVM_ allows for 
cheap and easy authentication of _NeonEVM_ users to let them interact with and effectively control those token accounts 
securely via this contract while this contract is the actual owner of those token accounts on _Solana_. It is also 
possible to create and initialize an _arbitrary SPL Token accounts_ for third party _Solana_ users, granting them full 
ownership of created accounts on _Solana_.

The `CallSPLTokenProgram.createInitializeArbitraryTokenAccount` function can be used for three different purposes:

* To create and initialize an _arbitrary token account_ to be used by `msg.sender` to send tokens through the 
**CallSPLTokenProgram** contract. In this case, both the `owner` and `tokenOwner` parameters passed to the function 
should be left empty. The _arbitrary token account_ to be created is derived from `msg.sender` and a `nonce` (that can 
be incremented to create different _arbitrary token accounts_). Only `msg.sender` is allowed to perform state changes to
the created token account via this contract. The `transferTokens` function grants `msg.sender` permission to transfer 
tokens from this _arbitrary token account_ by providing the `nonce` that was used to create the _arbitrary token account_.

* To create and initialize an _arbitrary token account_ to be used by a third party `user` NeonEVM account through 
the **CallSPLTokenProgram** contract. In this case, the `owner` parameter passed to the function should be  
`CallSPLTokenProgram.getNeonAddress(user)` and the `tokenOwner` parameter should be left empty. The _arbitrary token 
account_ to be created is derived from the `user` account and a `nonce` (that can be incremented to create different 
_arbitrary token accounts_). Only that `user` is allowed to perform state changes to the created token account via this 
contract. The `transferTokens` function grants `user` permission to transfer tokens from this _arbitrary token account_ 
by providing the `nonce` that was used to create the _arbitrary token account_.

* To create and initialize an _arbitrary token account_ to be used by a third party `solanaUser` _Solana_ account
to send tokens directly on _Solana_ without interacting with the **CallSPLTokenProgram** contract. In this case, both the 
`owner` and the `tokenOwner` parameters passed to the function should be `solanaUser`. The _arbitrary token account_ to 
be created is derived from the `solanaUser` account and a `nonce` (that can be incremented to create different 
_arbitrary token accounts_). The owner of the _arbitrary token account_ is the `solanaUser` account. The `solanaUser` 
account cannot transfer tokens from this _arbitrary token account_ by interacting with the **CallSPLTokenProgram** 
contract, instead it must interact directly with the **SPL Token** program on _Solana_ by signing and executing a 
`transfer` instruction.

## Tests

### Secret values setup

See detailed [instructions](../../README.md) for setting up secret values (such as private keys) used to run tests.

### Running tests

Contracts are deployed at the beginning of each test unless the `utils.js` file already contains the contract address.

The `system.test.js`, `spl-token.test.js` and `metaplex.test.js` test cases can be run on either _Curvestand_ test network or _Neon devnet_ 
using the following commands:

`npx hardhat test mocha ./test/composability/system.test.js --network < curvestand or neondevnet >`

`npx hardhat test mocha ./test/composability/spl-token.test.js --network < curvestand or neondevnet >`

`npx hardhat test mocha ./test/composability/metaplex.test.js --network < curvestand or neondevnet >`

The `raydium.test.js` and `raydium-create-pool-and-lock-LP.test.js` test cases can only be run on _Neon devnet_ using the 
following commands:

`npx hardhat test mocha ./test/composability/raydium.test.js --network neondevnet`

`npx hardhat test mocha ./test/composability/raydium-create-pool-and-lock-LP.test.js --network neondevnet`
