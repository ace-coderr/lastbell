import { robinhoodChain } from "@lastbell/shared";
import { defineChain, isAddress, type Address } from "viem";

/**
 * Build-time configuration (Vite env, set in Cloudflare Pages or web/.env.local):
 *   VITE_LASTBELL_ADDRESS  deployed contract; without it the app runs on demo data
 *   VITE_KEEPER_URL        keeper Worker base URL, for /status on the Flywheel screen
 *   VITE_DEPLOY_BLOCK      first block to search for fill events
 *   VITE_CHAIN=local       dev only: a local Hardhat node with a test wallet (never in production builds)
 */
const env = import.meta.env;

export const LOCAL = env.VITE_CHAIN === "local";

export const localChain = defineChain({
  id: 31337,
  name: "Hardhat (local)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export const appChain = LOCAL ? localChain : robinhoodChain;

const address = env.VITE_LASTBELL_ADDRESS as string | undefined;
export const LASTBELL: Address | undefined = address && isAddress(address) ? address : undefined;
export const KEEPER_URL: string | undefined = (env.VITE_KEEPER_URL as string | undefined)?.replace(/\/$/, "") || undefined;
export const DEPLOY_BLOCK = BigInt((env.VITE_DEPLOY_BLOCK as string | undefined) || "0");

/** Local dev wallet: Hardhat's first default account (public, well-known test key; the node holds it unlocked). */
export const LOCAL_ACCOUNT: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

/** Demo when there's no contract, or when the URL asks for it. */
export const DEMO = !LASTBELL || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo"));
