import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Gate, PARAMS, SATURDAY, deployFixture, networkHelpers, now, setPrice, t, usd, type Fixture } from "./fixture.js";

describe("gate", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
  });
  const status = async (market: 0 | 1 = 0) => (await f.lastbell.read.gate([market])).status;

  it("is Fresh mid-session with a recent round and an agreeing pool", async () => {
    assert.equal(await status(0), Gate.Fresh);
    assert.equal(await status(1), Gate.Fresh);
  });

  it("MarketClosed on weekends, still reporting the frozen price for the UI", async () => {
    await networkHelpers.time.increaseTo(SATURDAY);
    const g = await f.lastbell.read.gate([0]);
    assert.equal(g.status, Gate.MarketClosed);
    assert.equal(g.price, f.spyPrice);
    assert.equal(await f.lastbell.read.isMarketOpen(), false);
  });

  it("OraclePaused and TokenPaused follow the issuer flags", async () => {
    await f.spy.write.setOraclePaused([true]);
    assert.equal(await status(), Gate.OraclePaused);
    await f.spy.write.setOraclePaused([false]);
    await f.spy.write.setPaused([true]);
    assert.equal(await status(), Gate.TokenPaused);
    assert.equal(await status(1), Gate.Fresh); // other markets unaffected
  });

  it("BadAnswer for zero, negative, future-dated or reverting feeds", async () => {
    const ts = await now(f);
    await f.spyFeed.write.set([0n, ts]);
    assert.equal(await status(), Gate.BadAnswer);
    await f.spyFeed.write.set([-1n, ts]);
    assert.equal(await status(), Gate.BadAnswer);
    await f.spyFeed.write.set([f.spyPrice, ts + 3600n]);
    assert.equal(await status(), Gate.BadAnswer);
    await f.spyFeed.write.set([f.spyPrice, ts]);
    await f.spyFeed.write.setReverting([true]);
    assert.equal(await status(), Gate.BadAnswer);
  });

  it("NotUpdatedSinceOpen catches a pre-holiday price that is still inside its heartbeat", async () => {
    // Wed 25 Nov 19:59 EST round; Thanksgiving closes Thursday; trading resumes Thu 20:00 EST.
    await networkHelpers.time.increaseTo(t("2026-11-27T01:05:00Z"));
    await setPrice(f, 0, f.spyPrice, { updatedAt: t("2026-11-26T00:59:00Z") }); // 24h06m old < 24h15m
    assert.equal(await status(), Gate.NotUpdatedSinceOpen);
    await setPrice(f, 0, f.spyPrice, { updatedAt: t("2026-11-27T01:00:30Z") });
    assert.equal(await status(), Gate.Fresh);
  });

  it("NotUpdatedSinceOpen on Monday until the first round of the week", async () => {
    await networkHelpers.time.increaseTo(t("2026-11-09T01:00:20Z"));
    await setPrice(f, 0, f.spyPrice, { updatedAt: t("2026-11-07T00:59:00Z") });
    assert.equal(await status(), Gate.NotUpdatedSinceOpen);
  });

  it("OlderThanHeartbeat past heartbeat + grace, mid-week", async () => {
    const ts = await now(f);
    const limit = 86400n + BigInt(PARAMS.graceSeconds);
    // 30 s margins: the dev chain's clock can skip ahead a little between blocks.
    await setPrice(f, 0, f.spyPrice, { updatedAt: ts + 30n - limit });
    assert.equal(await status(), Gate.Fresh);
    await setPrice(f, 0, f.spyPrice, { updatedAt: ts - limit - 30n });
    assert.equal(await status(), Gate.OlderThanHeartbeat);
  });

  it("PoolOutOfBand when the pool and feed disagree by more than the band, either direction", async () => {
    for (const [market, price] of [[0, f.spyPrice], [1, f.nvdaPrice]] as const) {
      await setPrice(f, market, price, { poolPrice8: (price * 10_140n) / 10_000n });
      assert.equal(await status(market), Gate.Fresh, "1.40% above is inside 1.50%");
      await setPrice(f, market, price, { poolPrice8: (price * 10_160n) / 10_000n });
      assert.equal(await status(market), Gate.PoolOutOfBand, "1.60% above");
      await setPrice(f, market, price, { poolPrice8: (price * 9_840n) / 10_000n });
      assert.equal(await status(market), Gate.PoolOutOfBand, "1.60% below");
    }
  });

  it("checks in a fixed order: closed beats paused beats stale", async () => {
    await f.spy.write.setOraclePaused([true]);
    await networkHelpers.time.increaseTo(SATURDAY);
    assert.equal(await status(), Gate.MarketClosed);
  });
});
