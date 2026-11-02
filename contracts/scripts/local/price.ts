// Local test chain only: push a fresh oracle round (the pool follows).
//   SYMBOL=SPY PRICE=735 npx hardhat run --network localhost scripts/local/price.ts
import { network } from "hardhat";
import { parseUnits } from "viem";
import { loadDeployment, sqrtPriceFor } from "./helpers.js";

const { viem } = await network.getOrCreate();
const d = await loadDeployment();
const m = d.markets.find((x) => x.symbol === (process.env.SYMBOL ?? "SPY"));
if (!m) throw new Error("unknown SYMBOL");
const p8 = parseUnits(process.env.PRICE ?? "735", 8);
const now = (await (await viem.getPublicClient()).getBlock()).timestamp;
await (await viem.getContractAt("MockAggregator", m.feed)).write.set([p8, now]);
await (await viem.getContractAt("MockUniswapV3Pool", m.pool)).write.setSqrtPriceX96([sqrtPriceFor(p8, m.stockIsToken0)]);
console.log(`${m.symbol} -> ${process.env.PRICE ?? "735"} at ${now}`);
