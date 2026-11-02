import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t, viem } from "./fixture.js";

const NYSE_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

// Independent reference: the platform's IANA time zone database, not our date math.
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
});
function expectedOpen(ts: number): boolean {
  const p = Object.fromEntries(fmt.formatToParts(ts * 1000).map((x) => [x.type, x.value]));
  const base = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const trading = new Date(base + (Number(p.hour) >= 20 ? 86400000 : 0));
  const wd = trading.getUTCDay();
  return wd >= 1 && wd <= 5 && !NYSE_HOLIDAYS.has(trading.toISOString().slice(0, 10));
}

describe("MarketHours (Solidity)", async () => {
  const h = await viem.deployContract("MarketHoursHarness");

  it("matches the IANA time zone database on 3000 random instants in 2026-2027", async () => {
    let seed = 987654321;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const from = Date.parse("2026-01-01T00:00:00Z") / 1000;
    const to = Date.parse("2027-12-31T23:00:00Z") / 1000;
    const ts = Array.from({ length: 3000 }, () => Math.floor(from + rand() * (to - from)));
    for (let i = 0; i < ts.length; i += 500) {
      const batch = ts.slice(i, i + 500);
      const got = await h.read.batchIsOpen([batch.map(BigInt)]);
      batch.forEach((x, j) => assert.equal(got[j], expectedOpen(x), new Date(x * 1000).toISOString()));
    }
  });

  it("is exact at every session edge around DST switches and holidays", async () => {
    const cases: [string, boolean][] = [
      ["2026-11-02T00:59:59Z", false], // Sun 19:59 EST
      ["2026-11-02T01:00:00Z", true], // Sun 20:00 EST
      ["2026-10-30T23:59:59Z", true], // Fri 19:59 EDT
      ["2026-10-31T00:00:00Z", false], // Fri 20:00 EDT
      ["2027-03-14T23:59:59Z", false], // DST-start Sunday 19:59 EDT
      ["2027-03-15T00:00:00Z", true],
      ["2026-09-07T16:00:00Z", false], // Labor Day
      ["2026-09-08T00:00:00Z", true], // Mon 20:00 EDT
      ["2026-11-26T01:00:00Z", false], // Wed 20:00 EST before Thanksgiving
      ["2026-11-27T01:00:00Z", true], // Thu 20:00 EST
      ["2026-07-03T00:00:00Z", false], // Thu 20:00 EDT before observed July 4th
      ["2026-07-06T00:00:00Z", true], // Sun 20:00 EDT
    ];
    for (const [iso, open] of cases) assert.equal(await h.read.isOpen([t(iso)]), open, iso);
  });

  it("reports the start of the current open stretch", async () => {
    assert.deepEqual(await h.read.sessionStart([t("2026-11-04T15:00:00Z")]), [true, t("2026-11-02T01:00:00Z")]);
    assert.deepEqual(await h.read.sessionStart([t("2026-11-27T12:00:00Z")]), [true, t("2026-11-27T01:00:00Z")]);
    assert.deepEqual(await h.read.sessionStart([t("2026-09-08T05:00:00Z")]), [true, t("2026-09-08T00:00:00Z")]);
    assert.deepEqual(await h.read.sessionStart([t("2026-11-07T15:00:00Z")]), [false, 0n]);
  });

  it("encodes exactly the 20 NYSE holidays", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z") / 86400000;
    let count = 0;
    for (let d = start - 5; d < start + 775; d++) {
      const iso = new Date(d * 86400000).toISOString().slice(0, 10);
      const got = await h.read.isHoliday([BigInt(d)]);
      assert.equal(got, NYSE_HOLIDAYS.has(iso), iso);
      if (got) count++;
    }
    assert.equal(count, 20);
  });
});
