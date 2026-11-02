// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ISwapRouter02} from "../interfaces/IUniswapV3.sol";
import {MockUniswapV3Pool} from "./MockUniswapV3Pool.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @notice SwapRouter02 double. Swaps at the registered pool's spot price minus its fee and an optional
/// extra price impact, minting the output. `cheat` ignores amountOutMinimum and short-changes the
/// recipient so tests can prove Lastbell checks what actually arrived. Not deployed to mainnet.
contract MockSwapRouter is ISwapRouter02 {
    uint256 private constant Q96 = 1 << 96;

    mapping(bytes32 => MockUniswapV3Pool) public pools;
    uint256 public impactBps;
    bool public cheat;

    function register(MockUniswapV3Pool pool) external {
        pools[_key(pool.token0(), pool.token1(), pool.fee())] = pool;
    }

    function setImpactBps(uint256 value) external {
        impactBps = value;
    }

    function setCheat(bool value) external {
        cheat = value;
    }

    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice QuoterV2-compatible quote, priced exactly like the swap below.
    function quoteExactInputSingle(QuoteExactInputSingleParams calldata p)
        external
        view
        returns (uint256 amountOut, uint160, uint32, uint256)
    {
        return (_amountOut(p.tokenIn, p.tokenOut, p.amountIn, p.fee), 0, 0, 0);
    }

    function _amountOut(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee) internal view returns (uint256 out) {
        (address t0, address t1) = tokenIn < tokenOut ? (tokenIn, tokenOut) : (tokenOut, tokenIn);
        MockUniswapV3Pool pool = pools[_key(t0, t1, fee)];
        require(address(pool) != address(0), "no pool");
        uint256 sqrtP = pool.sqrtPriceX96();
        uint256 ratioX96 = Math.mulDiv(sqrtP, sqrtP, Q96); // token1 per token0, raw
        out = tokenIn == t0 ? Math.mulDiv(amountIn, ratioX96, Q96) : Math.mulDiv(amountIn, Q96, ratioX96);
        out = out * (1e6 - fee) / 1e6;
        out = out * (10_000 - impactBps) / 10_000;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        amountOut = _amountOut(p.tokenIn, p.tokenOut, p.amountIn, p.fee);
        if (cheat) {
            amountOut /= 2;
        } else {
            require(amountOut >= p.amountOutMinimum, "Too little received");
        }
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        IMintable(p.tokenOut).mint(p.recipient, amountOut);
    }

    function _key(address a, address b, uint24 fee) private pure returns (bytes32) {
        return keccak256(abi.encode(a, b, fee));
    }
}
