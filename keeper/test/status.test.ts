import { MARKET_LIST } from "@lastbell/shared";
import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { readStatus } from "../src/markets.js";

const t = (iso: string) => BigInt(Date.parse(iso) / 1000);

function fakeClient(now: bigint, updatedAt: bigint, flags = { oraclePaused: false, paused: false }): PublicClient {
  return {
    getBlock: async () => ({ number: 1n, timestamp: now }),
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "latestRoundData") return [1n, 75837790204n, updatedAt, updatedAt, 1n];
      if (functionName === "oraclePaused") return flags.oraclePaused;
      if (functionName === "paused") return flags.paused;
      throw new Error(functionName);
    },
  } as unknown as PublicClient;
}

describe("readStatus", () => {
  it("reports every market fresh mid-session", async () => {
    const r = await readStatus(fakeClient(t("2026-11-04T15:00:00Z"), t("2026-11-04T14:30:00Z")));
    expect(r.clock.open).toBe(true);
    expect(r.markets).toHaveLength(MARKET_LIST.length);
    expect(r.markets.every((m) => m.freshness.fresh)).toBe(true);
    expect(r.markets[0]?.price).toBe("758.37790204");
  });

  it("reports queued on a Sunday afternoon", async () => {
    const r = await readStatus(fakeClient(t("2026-11-01T20:00:00Z"), t("2026-10-30T23:00:00Z")));
    expect(r.markets.every((m) => m.freshness.reason === "market-closed")).toBe(true);
  });

  it("surfaces an issuer oracle pause", async () => {
    const r = await readStatus(fakeClient(t("2026-11-04T15:00:00Z"), t("2026-11-04T14:30:00Z"), { oraclePaused: true, paused: false }));
    expect(r.markets.every((m) => m.freshness.reason === "oracle-paused")).toBe(true);
  });
});
