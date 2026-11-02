// Quotes each Lastbell market pool at several trade sizes and compares with the Chainlink price.
// Usage: npm run spike:depth -w keeper
import { MARKET_LIST, UNISWAP_V3, USDG } from "@lastbell/shared";
import { formatUnits, parseAbi, parseUnits } from "viem";
import { client } from "./rpc.js";

const feedAbi = parseAbi(["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256, uint160, uint32, uint256)",
]);
const SIZES_USD = [100, 1_000, 10_000];

async function quote(tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint, fee: number) {
  const { result } = await client.simulateContract({
    address: UNISWAP_V3.quoterV2,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
  });
  return result[0];
}

const rows = [];
for (const m of MARKET_LIST) {
  const [, answer] = await client.readContract({ address: m.feed, abi: feedAbi, functionName: "latestRoundData" });
  const price = Number(formatUnits(answer, m.feedDecimals));
  const row: Record<string, string | number> = { market: m.symbol, oracle: price };
  for (const usd of SIZES_USD) {
    const sold = await quote(m.token, USDG.address, parseUnits((usd / price).toFixed(8), m.tokenDecimals), m.poolFee);
    const bought = await quote(USDG.address, m.token, parseUnits(String(usd), USDG.decimals), m.poolFee);
    row[`sell $${usd}`] = +((Number(formatUnits(sold, USDG.decimals)) / usd - 1) * 100).toFixed(2);
    row[`buy $${usd}`] = +(((Number(formatUnits(bought, m.tokenDecimals)) * price) / usd - 1) * 100).toFixed(2);
  }
  rows.push(row);
}
console.log("% difference from Chainlink (negative = worse than oracle)");
console.table(rows);
