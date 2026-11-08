import { describe, expect, it } from "vitest";
import { MAX_PAGES, PAGE, scanPlan } from "../src/scan.js";

describe("scanPlan", () => {
  it("reads everything when the list fits in one run", () => {
    expect(scanPlan(0n, 5)).toEqual({ starts: [], complete: true });
    expect(scanPlan(1n, 5)).toEqual({ starts: [0n], complete: true });
    const edge = scanPlan(PAGE * BigInt(MAX_PAGES), 99);
    expect(edge.complete).toBe(true);
    expect(edge.starts).toHaveLength(MAX_PAGES);
  });

  it("caps the reads per run however many orders exist", () => {
    for (const count of [PAGE * 16n, PAGE * 1000n, 10n ** 9n]) {
      const p = scanPlan(count, 3);
      expect(p.complete).toBe(false);
      expect(p.starts).toHaveLength(MAX_PAGES);
      expect(new Set(p.starts).size).toBe(MAX_PAGES);
      for (const s of p.starts) expect(s < count).toBe(true);
    }
  });

  it("moves the window each run so every order is visited, with no stored state", () => {
    const count = PAGE * 40n + 7n; // 41 pages
    const seen = new Set<bigint>();
    for (let round = 0; round < 41; round++) scanPlan(count, round).starts.forEach((s) => seen.add(s));
    expect(seen.size).toBe(41);
  });

  it("is stable for a given round and tolerates odd input", () => {
    const count = PAGE * 50n;
    expect(scanPlan(count, 12)).toEqual(scanPlan(count, 12));
    expect(scanPlan(count, -7).starts).toHaveLength(MAX_PAGES);
    expect(scanPlan(count, 1.9).starts).toHaveLength(MAX_PAGES);
  });
});
