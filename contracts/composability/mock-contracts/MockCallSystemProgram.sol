// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { LibSystemData } from "../libraries/system-program/LibSystemData.sol";

/// @title MockCallSystemProgram
/// @notice Mock contract used to test LibSystemData's internal functions
/// @author maxpolizzo@gmail.com
contract MockCallSystemProgram {
    /// @param accountBytesSize The storage space allocated to considered Solana account in bytes
    /// @param rentDataBytes The rent data in the same format as it stored on Solana's
    /// SysvarRent111111111111111111111111111111111 account
    /// @return account's minimum balance for rent exemption
    function getRentExemptionBalance(uint64 accountBytesSize, bytes memory rentDataBytes) external view returns(uint64) {
        return LibSystemData.getRentExemptionBalance(accountBytesSize, rentDataBytes);
    }
}
