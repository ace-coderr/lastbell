import { MARKETS, isMarketOpen, sessionStart, type MarketSymbol } from "@lastbell/shared";
import type { FlywheelStats, UiMarket, UiOrder } from "./model.js";

// Demo mode: realistic data for the screens before (or without) a deployed contract.
// Prices are mainnet readings from 2 Nov 2026; the gate follows the real market clock,
// so on a weekend the demo shows exactly what a user would see: orders queued until the open.

const PRICES: Record<MarketSymbol, { price: number; pool: number }> = {
  SPY: { price: 763.69, pool: 763.92 },
  NVDA: { price: 207.65, pool: 207.41 },
  AAPL: { price: 339.91, pool: 340.08 },
};

export function demoMarkets(now: number): UiMarket[] {
  const open = isMarketOpen(now);
  const start = sessionStart(now) ?? now - 86400;
  return (["SPY", "NVDA", "AAPL"] as const).map((symbol, id) => ({
    id,
    symbol,
    name: MARKETS[symbol].name,
    price: PRICES[symbol].price,
    poolPrice: PRICES[symbol].pool,
    updatedAt: open ? Math.max(start, now - 420 - id * 600) : now - 40 * 3600,
    gate: open ? "fresh" : "market-closed",
  }));
}

export function demoOrders(now: number): UiOrder[] {
  const day = 86400;
  return [
    { id: "14", market: "NVDA", kind: "stop", amountIn: 25, trigger: 210, slippageBps: 100, expiry: now + 6 * day, feeWif: 80, status: "open" },
    { id: "12", market: "SPY", kind: "stop", amountIn: 2, trigger: 740, slippageBps: 100, expiry: now + 5 * day, feeWif: 50, status: "open" },
    { id: "9", market: "AAPL", kind: "limit", amountIn: 1000, trigger: 330, slippageBps: 50, expiry: now + 12 * day, feeWif: 60, status: "open" },
    { id: "7", market: "SPY", kind: "stop", amountIn: 1.5, trigger: 762, slippageBps: 100, expiry: now + 2 * day, feeWif: 50, status: "filled", amountOut: 1141.62 },
    { id: "5", market: "NVDA", kind: "limit", amountIn: 500, trigger: 190, slippageBps: 50, expiry: now - 3 * 3600, feeWif: 50, status: "open" },
  ];
}

export function demoFlywheel(now: number): FlywheelStats {
  return {
    burnedFromFees: 3_125,
    slashedBurned: 10_000,
    paidToKeepers: 3_125,
    bonded: 450_000,
    prepaid: 1_850,
    fills: 62,
    orders: 141,
    keepers: [
      { address: "0x7a3c1f0e9b2d4c5a6e8f0a1b2c3d4e5f6a7b9c21", bondWif: 300_000, capacity: 30, activeClaims: 1, fills: 51, slashes: 0 },
      { address: "0x1e94b0c7d2a3f4e5d6c7b8a9f0e1d2c3b4a5d6e8", bondWif: 150_000, capacity: 15, activeClaims: 0, fills: 11, slashes: 1 },
    ],
    lastRun: { at: new Date((now - 23) * 1000).toISOString(), ok: true, summary: "3 open · 1 armed · 2 queued · no action needed" },
  };
}
