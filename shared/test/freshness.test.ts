import { describe, expect, it } from "vitest";
import { evaluateFreshness, type FeedSnapshot } from "../src/freshness.js";

const t = (iso: string) => Date.parse(iso) / 1000;
const feed = (over: Partial<FeedSnapshot> = {}): FeedSnapshot => ({
  answer: 20528000142n,
  updatedAt: t("2026-11-04T14:00:00Z"),
  heartbeatSeconds: 86400,
  oraclePaused: false,
  tokenPaused: false,
  ...over,
});

describe("evaluateFreshness", () => {
  const wednesday = t("2026-11-04T15:00:00Z");

  it("accepts an in-session price", () => {
    expect(evaluateFreshness(feed(), wednesday)).toEqual({ fresh: true, ageSeconds: 3600 });
  });

  it("queues on the weekend even when the price is younger than the heartbeat", () => {
    // Friday-evening update, Saturday morning check: only 14h old, still must not fire.
    const r = evaluateFreshness(feed({ updatedAt: t("2026-11-06T23:00:00Z") }), t("2026-11-07T13:00:00Z"));
    expect(r).toMatchObject({ fresh: false, reason: "market-closed" });
  });

  it("queues until the first update after the open", () => {
    const r = evaluateFreshness(feed({ updatedAt: t("2026-11-06T23:00:00Z") }), t("2026-11-09T01:30:00Z"));
    expect(r).toMatchObject({ fresh: false, reason: "not-updated-since-open" });
  });

  it("respects oraclePaused and token pause", () => {
    expect(evaluateFreshness(feed({ oraclePaused: true }), wednesday).reason).toBe("oracle-paused");
    expect(evaluateFreshness(feed({ tokenPaused: true }), wednesday).reason).toBe("token-paused");
  });

  it("rejects non-positive answers", () => {
    expect(evaluateFreshness(feed({ answer: 0n }), wednesday).reason).toBe("bad-answer");
    expect(evaluateFreshness(feed({ answer: -1n }), wednesday).reason).toBe("bad-answer");
  });

  it("rejects prices older than heartbeat plus grace", () => {
    const now = t("2026-11-05T15:00:00Z");
    expect(evaluateFreshness(feed({ updatedAt: now - 86400 - 900 }), now).fresh).toBe(true);
    expect(evaluateFreshness(feed({ updatedAt: now - 86400 - 901 }), now).reason).toBe("older-than-heartbeat");
  });
});
