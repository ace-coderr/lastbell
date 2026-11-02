import { describe, expect, it } from "vitest";
import { RESTRICTED_REGIONS, regionStatus } from "../src/region.js";

describe("regionStatus", () => {
  it("blocks exactly the 15 restricted regions", () => {
    const listed = ["US", "CA", "GB", "CH", "CU", "BY", "IR", "KP", "RU", "SY", "UA", "SS", "SD", "MM", "VE"];
    expect(Object.keys(RESTRICTED_REGIONS).sort()).toEqual([...listed].sort());
    for (const c of listed) expect(regionStatus(c)).toBe("blocked");
  });

  it("allows everywhere else", () => {
    for (const c of ["DE", "NG", "IN", "BR", "SG", "AE", "FR", "JP"]) expect(regionStatus(c)).toBe("allowed");
  });

  it("is case-insensitive", () => {
    expect(regionStatus("us")).toBe("blocked");
    expect(regionStatus(" de ")).toBe("allowed");
  });

  it("treats missing, unknown (XX), Tor (T1) and junk as unknown", () => {
    for (const c of [undefined, null, "", "XX", "T1", "USA", "1A"]) expect(regionStatus(c)).toBe("unknown");
  });
});
