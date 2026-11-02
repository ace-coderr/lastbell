import { afterEach, describe, expect, it, vi } from "vitest";

const root = (dataset: Record<string, string>) => ({ dataset }) as unknown as HTMLElement;

describe("readRegion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("trusts the Pages Function stamp", async () => {
    const { readRegion } = await import("../src/region.js");
    expect(readRegion(root({ region: "blocked", country: "US" }), "")).toEqual({ status: "blocked", country: "US", place: "the United States" });
    expect(readRegion(root({ region: "allowed", country: "DE" }), "")).toEqual({ status: "allowed", country: "DE", place: undefined });
  });

  it("in production, a page without the stamp keeps orders off", async () => {
    vi.stubEnv("DEV", false);
    const { readRegion } = await import("../src/region.js");
    expect(readRegion(root({}), "").status).toBe("unknown");
    // and the dev preview override does nothing in production
    expect(readRegion(root({ region: "blocked", country: "US" }), "?region=DE").status).toBe("blocked");
  });

  it("in dev, defaults to allowed and supports ?region= to preview the gate", async () => {
    vi.stubEnv("DEV", true);
    const { readRegion } = await import("../src/region.js");
    expect(readRegion(root({}), "").status).toBe("allowed");
    expect(readRegion(root({}), "?region=gb")).toEqual({ status: "blocked", country: "GB", place: "the United Kingdom" });
  });
});
