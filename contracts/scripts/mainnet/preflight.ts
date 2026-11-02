// Read-only: balances that the deploy, the keeper bond and the demo orders need. No keys involved.
//   ADDRESSES=0xDeployer,0xKeeper npx tsx scripts/mainnet/preflight.ts
import { MARKETS, USDG, WIF } from "@lastbell/shared";
import { erc20Abi, formatEther, formatUnits, isAddress, type Address } from "viem";
import { PARAMS, publicClient } from "./config.js";

const addresses = (process.env.ADDRESSES ?? "").split(",").map((a) => a.trim()).filter(Boolean);
if (!addresses.length || !addresses.every((a) => isAddress(a))) throw new Error("Set ADDRESSES=0x...,0x... (public addresses only)");

const chainId = await publicClient.getChainId();
if (chainId !== 4663) throw new Error(`Connected to chain ${chainId}, expected Robinhood Chain (4663)`);
const gasPrice = await publicClient.getGasPrice();
console.log(`Robinhood Chain ${chainId}, gas price ${formatUnits(gasPrice, 9)} gwei`);

const tokens: [string, Address, number][] = [
  ["WIF", WIF.address, 18],
  ["USDG", USDG.address, 6],
  ["SPY", MARKETS.SPY.token, 18],
  ["NVDA", MARKETS.NVDA.token, 18],
  ["AAPL", MARKETS.AAPL.token, 18],
];
for (const who of addresses as Address[]) {
  const eth = await publicClient.getBalance({ address: who });
  const bals = await Promise.all(tokens.map(([, t]) => publicClient.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [who] })));
  console.log(`\n${who}`);
  console.log(`  ETH   ${formatEther(eth)}`);
  tokens.forEach(([sym, , dec], i) => console.log(`  ${sym.padEnd(5)} ${formatUnits(bals[i]!, dec)}`));
}
console.log(`\nKeeper needs ≥ ${formatUnits(PARAMS.minBond, 18)} WIF to bond; each order needs ≥ ${formatUnits(PARAMS.minFee, 18)} WIF fee.`);
