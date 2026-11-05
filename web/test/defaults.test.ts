import { describe, expect, it } from "vitest";
import { defaultAmount } from "../src/lib/defaults.js";

describe("defaultAmount", () => {
  it("opens a stop-loss on a few dollars of the token, never whole shares", () => {
    for (const price of [763.69, 207.65, 339.91, 20, 5, 90_000]) {
      const value = Number(defaultAmount("stop", price)) * price;
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(12.5);
    }
    expect(defaultAmount("stop", 763.69)).toBe("0.01");
    expect(defaultAmount("stop", 207.65)).toBe("0.05");
  });

  it("opens a limit buy on 10 USDG and survives a bad price", () => {
    expect(defaultAmount("limit", 207)).toBe("10");
    expect(defaultAmount("stop", 0)).toBe("0.01");
  });
});
