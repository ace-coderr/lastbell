// Samples recent rounds of each Lastbell market feed and reports update gaps.
// Usage: npm run spike:cadence -w keeper -- [rounds=600]
import { MARKET_LIST } from "@lastbell/shared";
import { parseAbi } from "viem";
import { client } from "./rpc.js";

const abi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function getRoundData(uint80) view returns (uint80, int256, uint256, uint256, uint80)",
]);
const N = BigInt(process.argv[2] ?? 600);

const pct = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

for (const m of MARKET_LIST) {
  const [latest] = await client.readContract({ address: m.feed, abi, functionName: "latestRoundData" });
  const ids = Array.from({ length: Number(N) }, (_, i) => latest - BigInt(i));
  const rounds = await Promise.all(
    ids.map((id) => client.readContract({ address: m.feed, abi, functionName: "getRoundData", args: [id] }).catch(() => null)),
  );
  const times = rounds.flatMap((r) => (r && r[3] > 0n ? [Number(r[3])] : [])).sort((a, b) => a - b);
  const gaps = times.slice(1).map((x, i) => x - times[i]!).sort((a, b) => a - b);
  const weekday = gaps.filter((g) => g < 12 * 3600);
  console.log(
    `${m.symbol}: ${times.length} rounds ${new Date(times[0]! * 1000).toISOString().slice(0, 10)}..` +
      `${new Date(times.at(-1)! * 1000).toISOString().slice(0, 10)} | median ${Math.round(pct(gaps, 0.5) / 60)} min, ` +
      `p90 ${(pct(gaps, 0.9) / 3600).toFixed(1)} h, max weekday ${((weekday.at(-1) ?? 0) / 3600).toFixed(1)} h, ` +
      `max ${((gaps.at(-1) ?? 0) / 3600).toFixed(1)} h`,
  );
}
