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

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        (address t0, address t1) = p.tokenIn < p.tokenOut ? (p.tokenIn, p.tokenOut) : (p.tokenOut, p.tokenIn);
        MockUniswapV3Pool pool = pools[_key(t0, t1, p.fee)];
        require(address(pool) != address(0), "no pool");

        uint256 sqrtP = pool.sqrtPriceX96();
        uint256 ratioX96 = Math.mulDiv(sqrtP, sqrtP, Q96); // token1 per token0, raw
        amountOut = p.tokenIn == t0 ? Math.mulDiv(p.amountIn, ratioX96, Q96) : Math.mulDiv(p.amountIn, Q96, ratioX96);
        amountOut = amountOut * (1e6 - pool.fee()) / 1e6;
        amountOut = amountOut * (10_000 - impactBps) / 10_000;

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
