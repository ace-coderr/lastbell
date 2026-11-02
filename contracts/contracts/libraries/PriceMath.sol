// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title PriceMath
/// @notice Decimal-explicit conversions between stock amounts, quote amounts and feed prices.
/// `price` is quote-per-stock in feed units (10**feedDecimals = 1.0).
library PriceMath {
    uint256 internal constant Q96 = 1 << 96;
    uint256 internal constant BPS = 10_000;

    /// @notice Quote value of `stockAmount` at `price`.
    function quoteValue(uint256 stockAmount, uint256 price, uint256 stockUnit, uint256 quoteUnit, uint256 feedUnit)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(stockAmount, price * quoteUnit, stockUnit * feedUnit);
    }

    /// @notice Stock amount that `quoteAmount` buys at `price`.
    function stockValue(uint256 quoteAmount, uint256 price, uint256 stockUnit, uint256 quoteUnit, uint256 feedUnit)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(quoteAmount, stockUnit * feedUnit, price * quoteUnit);
    }

    /// @notice Spot price of a Uniswap v3 pool expressed like the feed (quote per stock, feed units).
    function poolPrice(uint160 sqrtPriceX96, bool stockIsToken0, uint256 stockUnit, uint256 quoteUnit, uint256 feedUnit)
        internal
        pure
        returns (uint256)
    {
        // raw token1 per raw token0, scaled by 2^96
        uint256 ratioX96 = Math.mulDiv(sqrtPriceX96, sqrtPriceX96, Q96);
        if (ratioX96 == 0) return 0;
        return stockIsToken0
            ? Math.mulDiv(ratioX96, stockUnit * feedUnit, quoteUnit * Q96)
            : Math.mulDiv(Q96, stockUnit * feedUnit, ratioX96 * quoteUnit);
    }

    /// @notice |a - b| / b in basis points, rounded up.
    function deviationBps(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 diff = a > b ? a - b : b - a;
        return Math.mulDiv(diff, BPS, b, Math.Rounding.Ceil);
    }
}
