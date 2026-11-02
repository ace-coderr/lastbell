// Mainnet deployment settings. Every address comes from shared/src/markets.ts, all verified on chain
// during the feasibility spike. Parameters are deliberately small so live testing stays cheap.
import { existsSync, readFileSync } from "node:fs";
import { MARKETS, UNISWAP_V3, USDG, WIF, robinhoodChain } from "@lastbell/shared";
import { createPublicClient, http, parseUnits, type Address } from "viem";

// Keys live only in contracts/.env (gitignored). Node's built-in loader, no extra dependency.
const ENV_FILE = new URL("../../.env", import.meta.url);
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

export const RPC_URL = process.env.ROBINHOOD_RPC_URL || robinhoodChain.rpcUrls.default.http[0];
export const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(RPC_URL, { retryCount: 5, retryDelay: 1000 }) });

export const PARAMS = {
  wif: WIF.address,
  quote: USDG.address,
  router: UNISWAP_V3.swapRouter02,
  minFee: parseUnits("20", 18), // ≈ $0.03 at $0.00135/WIF
  minBond: parseUnits("20000", 18), // ≈ $27
  slashAmount: parseUnits("2000", 18), // 10 concurrent claims per minimum bond
  claimWindow: 120,
  graceSeconds: 900,
  maxSlippageBps: 300,
} as const;

export const MARKET_CONFIGS = (["SPY", "NVDA", "AAPL"] as const).map((s) => ({
  token: MARKETS[s].token,
  feed: MARKETS[s].feed,
  pool: MARKETS[s].pool,
  heartbeat: MARKETS[s].heartbeatSeconds,
  maxDeviationBps: 150,
}));

export const DEPLOYMENT_FILE = new URL("../../deployments/robinhood-mainnet.json", import.meta.url);

export interface Deployment {
  chainId: number;
  lastbell: Address;
  deployer: Address;
  txHash: `0x${string}`;
  block: string;
  deployedAt: string;
  params: Record<string, string | number>;
  markets: { symbol: string; token: Address; feed: Address; pool: Address }[];
}

export function loadDeployment(): Deployment {
  if (!existsSync(DEPLOYMENT_FILE)) throw new Error("No mainnet deployment recorded yet (contracts/deployments/robinhood-mainnet.json).");
  return JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf8"));
}

export function artifact(): { abi: readonly unknown[]; bytecode: `0x${string}` } {
  return JSON.parse(readFileSync(new URL("../../artifacts/contracts/Lastbell.sol/Lastbell.json", import.meta.url), "utf8"));
}

/** Private key from contracts/.env, checked for shape only. Never printed. */
export function keyFromEnv(name: "DEPLOYER_PRIVATE_KEY" | "KEEPER_PRIVATE_KEY"): `0x${string}` {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name} is not set in contracts/.env`);
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${name} doesn't look like a 32-byte hex private key`);
  return key;
}

export const BROADCAST = process.env.BROADCAST === "1";
