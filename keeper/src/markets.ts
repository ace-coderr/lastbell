import { MARKET_LIST, evaluateFreshness, marketClock, type Freshness, type MarketClock } from "@lastbell/shared";
import { formatUnits, parseAbi, type PublicClient } from "viem";

export const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);
export const stockAbi = parseAbi(["function oraclePaused() view returns (bool)", "function paused() view returns (bool)"]);

export interface MarketStatus {
  symbol: string;
  price: string;
  updatedAt: number;
  oraclePaused: boolean;
  tokenPaused: boolean;
  freshness: Freshness;
}

export interface StatusReport {
  now: number;
  block: string;
  clock: MarketClock;
  markets: MarketStatus[];
}

export async function readStatus(client: PublicClient): Promise<StatusReport> {
  const block = await client.getBlock();
  const now = Number(block.timestamp);
  const markets = await Promise.all(
    MARKET_LIST.map(async (m) => {
      const [round, oraclePaused, tokenPaused] = await Promise.all([
        client.readContract({ address: m.feed, abi: feedAbi, functionName: "latestRoundData" }),
        client.readContract({ address: m.token, abi: stockAbi, functionName: "oraclePaused" }),
        client.readContract({ address: m.token, abi: stockAbi, functionName: "paused" }),
      ]);
      const answer = round[1];
      const updatedAt = Number(round[3]);
      return {
        symbol: m.symbol,
        price: formatUnits(answer, m.feedDecimals),
        updatedAt,
        oraclePaused,
        tokenPaused,
        freshness: evaluateFreshness({ answer, updatedAt, heartbeatSeconds: m.heartbeatSeconds, oraclePaused, tokenPaused }, now),
      };
    }),
  );
  return { now, block: block.number.toString(), clock: marketClock(now), markets };
}
