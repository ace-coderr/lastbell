// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

/// @notice Test double for a Chainlink feed. Not deployed to mainnet.
contract MockAggregator is IAggregatorV3 {
    uint8 public immutable override decimals;
    uint80 private _roundId;
    int256 private _answer;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 answer_, uint256 updatedAt_) {
        decimals = decimals_;
        _set(answer_, updatedAt_);
    }

    function set(int256 answer_, uint256 updatedAt_) external {
        _set(answer_, updatedAt_);
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    function _set(int256 answer_, uint256 updatedAt_) private {
        _roundId++;
        _answer = answer_;
        _updatedAt = updatedAt_;
    }
}
