import { describe, expect, it } from "vitest";
import {
  NYSE_HOLIDAYS,
  civilFromDays,
  daysFromCivil,
  isMarketOpen,
  isUsDst,
  marketClock,
  nextClose,
  nextOpen,
  sessionStart,
} from "../src/marketHours.js";

const t = (iso: string) => Date.parse(iso) / 1000;

describe("civil date math", () => {
  it("round-trips days and dates", () => {
    for (let d = -1000; d < 40000; d += 37) {
      const { year, month, day } = civilFromDays(d);
      expect(daysFromCivil(year, month, day)).toBe(d);
    }
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(daysFromCivil(2026, 11, 2)).toBe(t("2026-11-02T00:00:00Z") / 86400);
  });
});

describe("US DST", () => {
  it("switches on the 2nd Sunday of March and 1st Sunday of November", () => {
    expect(isUsDst(t("2026-03-08T06:59:59Z"))).toBe(false);
    expect(isUsDst(t("2026-03-08T07:00:00Z"))).toBe(true);
    expect(isUsDst(t("2026-11-01T05:59:59Z"))).toBe(true);
    expect(isUsDst(t("2026-11-01T06:00:00Z"))).toBe(false);
    expect(isUsDst(t("2027-03-14T07:00:00Z"))).toBe(true);
    expect(isUsDst(t("2027-11-07T06:00:00Z"))).toBe(false);
  });
});

describe("session window", () => {
  it("is closed over the weekend and opens Sunday 20:00 ET", () => {
    // Snapshot from the feasibility spike: Sunday 18:45 EST, feeds 2 days old.
    const sunday = t("2026-11-01T23:45:53Z");
    expect(isMarketOpen(sunday)).toBe(false);
    expect(nextOpen(sunday)).toBe(t("2026-11-02T01:00:00Z"));
    expect(isMarketOpen(t("2026-11-02T00:59:59Z"))).toBe(false);
    expect(isMarketOpen(t("2026-11-02T01:00:00Z"))).toBe(true);
    expect(sessionStart(t("2026-11-03T15:00:00Z"))).toBe(t("2026-11-02T01:00:00Z"));
  });

  it("closes Friday 20:00 ET (EDT and EST)", () => {
    expect(isMarketOpen(t("2026-10-30T23:59:59Z"))).toBe(true);
    expect(isMarketOpen(t("2026-10-31T00:00:00Z"))).toBe(false);
    expect(nextClose(t("2026-10-28T12:00:00Z"))).toBe(t("2026-10-31T00:00:00Z"));
    expect(isMarketOpen(t("2026-11-07T00:59:59Z"))).toBe(true);
    expect(isMarketOpen(t("2026-11-07T01:00:00Z"))).toBe(false);
  });

  it("handles the DST-start Sunday", () => {
    expect(isMarketOpen(t("2027-03-14T23:59:59Z"))).toBe(false);
    expect(isMarketOpen(t("2027-03-15T00:00:00Z"))).toBe(true);
  });

  it("treats Labor Day as closed and reopens Monday 20:00 ET", () => {
    // Feeds showed no update from Fri 4 Sep until Tue 8 Sep 00:00 UTC.
    expect(isMarketOpen(t("2026-09-07T00:00:00Z"))).toBe(false); // Sun 20:00 EDT, but Monday is a holiday
    expect(isMarketOpen(t("2026-09-07T16:00:00Z"))).toBe(false);
    expect(nextOpen(t("2026-09-07T16:00:00Z"))).toBe(t("2026-09-08T00:00:00Z"));
    expect(sessionStart(t("2026-09-08T05:00:00Z"))).toBe(t("2026-09-08T00:00:00Z"));
  });

  it("closes for a mid-week holiday (Thanksgiving)", () => {
    expect(isMarketOpen(t("2026-11-26T00:59:59Z"))).toBe(true); // Wed 19:59 EST
    expect(isMarketOpen(t("2026-11-26T01:00:00Z"))).toBe(false);
    expect(isMarketOpen(t("2026-11-27T01:00:00Z"))).toBe(true); // Thu 20:00 EST, Friday early-close day
    expect(sessionStart(t("2026-11-27T12:00:00Z"))).toBe(t("2026-11-27T01:00:00Z"));
    expect(nextClose(t("2026-11-24T12:00:00Z"))).toBe(t("2026-11-26T01:00:00Z"));
  });

  it("closes for a Friday holiday through the weekend (3 Jul 2026)", () => {
    expect(isMarketOpen(t("2026-07-02T23:59:59Z"))).toBe(true);
    expect(isMarketOpen(t("2026-07-03T00:00:00Z"))).toBe(false);
    expect(nextOpen(t("2026-07-03T00:00:00Z"))).toBe(t("2026-07-06T00:00:00Z"));
  });

  it("agrees with the platform time zone database on random instants", () => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      weekday: "short",
    });
    const holidays = new Set<string>(NYSE_HOLIDAYS);
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const from = t("2026-01-01T00:00:00Z");
    const to = t("2027-12-31T00:00:00Z");
    for (let i = 0; i < 5000; i++) {
      const ts = Math.floor(from + rand() * (to - from));
      const parts = Object.fromEntries(fmt.formatToParts(ts * 1000).map((p) => [p.type, p.value]));
      // Trading day = Eastern date, rolled forward one day from 20:00 on.
      const base = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
      const trading = new Date(base + (Number(parts.hour) >= 20 ? 86400000 : 0));
      const wd = trading.getUTCDay();
      const expected = wd >= 1 && wd <= 5 && !holidays.has(trading.toISOString().slice(0, 10));
      expect(isMarketOpen(ts), new Date(ts * 1000).toISOString()).toBe(expected);
    }
  });

  it("exposes a consistent clock", () => {
    const open = marketClock(t("2026-11-04T15:00:00Z"));
    expect(open.open).toBe(true);
    expect(open.nextOpen).toBe(t("2026-11-04T15:00:00Z"));
    const closed = marketClock(t("2026-11-07T12:00:00Z"));
    expect(closed).toEqual({ open: false, sessionStart: null, nextOpen: t("2026-11-09T01:00:00Z"), nextClose: null });
  });
});
