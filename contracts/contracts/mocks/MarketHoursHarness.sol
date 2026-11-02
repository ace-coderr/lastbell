// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MarketHours} from "../libraries/MarketHours.sol";

/// @notice Exposes MarketHours for cross-checking against an independent implementation. Not deployed.
contract MarketHoursHarness {
    function isOpen(uint256 ts) external pure returns (bool) {
        return MarketHours.isOpen(ts);
    }

    function sessionStart(uint256 ts) external pure returns (bool, uint256) {
        return MarketHours.sessionStart(ts);
    }

    function isUsDst(uint256 ts) external pure returns (bool) {
        return MarketHours.isUsDst(ts);
    }

    function isHoliday(uint256 dayNumber) external pure returns (bool) {
        return MarketHours.isHoliday(dayNumber);
    }

    function batchIsOpen(uint256[] calldata ts) external pure returns (bool[] memory out) {
        out = new bool[](ts.length);
        for (uint256 i; i < ts.length; ++i) out[i] = MarketHours.isOpen(ts[i]);
    }
}
