import { DEMO } from "../config.js";

/**
 * Every statistic on the site says what it measures, over what period and where the number comes from.
 * In demo mode the numbers are samples, and the line says so.
 */
export const SAMPLE = "Sample data (demo mode), not read from the chain";

const live = (period: string, reads: string) => (DEMO ? SAMPLE : `${period} · Lastbell contract on Robinhood Chain (${reads})`);

export const SOURCE = {
  fills: () => live("All time since deployment", "totalFills, orderCount"),
  burned: () => live("All time since deployment", "totalFeesBurned, totalSlashed"),
  paid: () => live("All time since deployment", "totalKeeperPaid"),
  bonded: () => live("Right now", "totalBonded"),
  bondedAndHeld: () => live("Right now", "totalBonded, totalFeeHeld"),
  marketsLive: () => live("Right now", "gate() per market"),
  feeSplit: () => live("All time since deployment", "totalFeesBurned, totalKeeperPaid"),
  keepers: () => live("Per keeper, all time", "keepers()"),
  gates: () => live("Right now", "gate(): Chainlink price and update time, Uniswap v3 pool price"),
  prices: () => (DEMO ? SAMPLE : "Chainlink price and update time, and the Uniswap v3 pool price, read now via the Lastbell contract (gate())"),
};
