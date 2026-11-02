// Lists every Stock Token feed in Chainlink's Robinhood directory with live on-chain state.
// Usage: npm run spike:feeds -w keeper
import { readFileSync } from "node:fs";
import { formatUnits, parseAbi, type Address } from "viem";
import { evaluateFreshness } from "@lastbell/shared";
import { CHAINLINK_DIRECTORY, client } from "./rpc.js";

interface DirectoryFeed {
  name: string;
  proxyAddress: Address;
  heartbeat: number;
  threshold: number;
  docs?: { baseAsset?: string; marketHours?: string };
}

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
]);
const stockAbi = parseAbi(["function oraclePaused() view returns (bool)", "function paused() view returns (bool)"]);

// Token addresses come from the docs' on-chain asset registry, captured in the feasibility snapshot.
const snapshot = JSON.parse(readFileSync(new URL("../../docs/data/feasibility-snapshot.json", import.meta.url), "utf8")) as {
  feeds: { sym: string; token: Address }[];
};
const tokenOf = new Map(snapshot.feeds.map((f) => [f.sym, f.token]));

const directory = (await (await fetch(CHAINLINK_DIRECTORY)).json()) as DirectoryFeed[];
const equities = directory.filter((f) => f.docs?.marketHours === "us_equities_24/5" || f.docs?.baseAsset === "GLD");
const block = await client.getBlock();
const now = Number(block.timestamp);

const rows = await Promise.all(
  equities.map(async (f) => {
    const sym = f.docs?.baseAsset ?? f.name.replace(/^Robinhood /, "").split(/[ /-]/)[0]!;
    const token = tokenOf.get(sym) ?? tokenOf.get(sym.replace(/^RH/, "")); // DELL is listed as "RHDELL"
    const [round, decimals, oraclePaused, tokenPaused] = await Promise.all([
      client.readContract({ address: f.proxyAddress, abi: feedAbi, functionName: "latestRoundData" }),
      client.readContract({ address: f.proxyAddress, abi: feedAbi, functionName: "decimals" }),
      token ? client.readContract({ address: token, abi: stockAbi, functionName: "oraclePaused" }) : Promise.resolve(undefined),
      token ? client.readContract({ address: token, abi: stockAbi, functionName: "paused" }) : Promise.resolve(undefined),
    ]);
    const updatedAt = Number(round[3]);
    const fresh = evaluateFreshness(
      { answer: round[1], updatedAt, heartbeatSeconds: f.heartbeat, oraclePaused: !!oraclePaused, tokenPaused: !!tokenPaused },
      now,
    );
    return {
      sym,
      price: Number(formatUnits(round[1], decimals)),
      decimals,
      heartbeat: f.heartbeat,
      ageMin: Math.round((now - updatedAt) / 60),
      oraclePaused,
      tokenPaused,
      gate: fresh.fresh ? "fresh" : fresh.reason,
    };
  }),
);

console.log(`block ${block.number} at ${new Date(now * 1000).toISOString()}, ${rows.length} equity feeds`);
console.table(rows.sort((a, b) => a.sym.localeCompare(b.sym)));
