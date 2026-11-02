import { parseAbi } from "viem";

/** Uniswap QuoterV2 (Robinhood Chain 0x33e8…A9E7). Non-view on chain; call it with eth_call / simulate. */
export const quoterV2Abi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
