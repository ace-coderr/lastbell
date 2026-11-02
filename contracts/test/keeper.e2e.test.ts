// Runs the keeper's real engine (keeper/src/engine.ts) against the contracts on Hardhat's chain.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { runOnce } from "../../keeper/src/engine.js";
import {
  PARAMS, SATURDAY, STOCK, Status, USDG, WIF, bondKeeper, deployFixture, networkHelpers, now, place, setPrice, usd,
  type Fixture,
} from "./fixture.js";

describe("keeper engine end to end", () => {
  let f: Fixture;
  let cfg: { lastbell: `0x${string}`; quoter: `0x${string}` };
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
    await bondKeeper(f);
    cfg = { lastbell: f.lastbell.address, quoter: f.router.address };
  });
  const run = () => runOnce(f.publicClient as never, f.keeper as never, cfg);

  it("leaves armed orders alone, then claims and fills once the price crosses", async () => {
    const id = await place(f, { amountIn: STOCK("2"), fee: WIF("120") });
    const quiet = await run();
    assert.equal(quiet.results.length, 0);
    assert.deepEqual(quiet.skipped, { "not-triggered": 1 });

    await setPrice(f, 0, usd("735"));
    const keeperWif = await f.wif.read.balanceOf([f.keeper.account.address]);
    const report = await run();
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0]!.ok, true, report.results[0]!.note);
    assert.equal(report.results[0]!.txs.length, 2); // claim + fill
    assert.equal((await f.lastbell.read.getOrder([id])).status, Status.Filled);
    assert.equal((await f.wif.read.balanceOf([f.keeper.account.address])) - keeperWif, WIF("60"));
  });

  it("queues everything over the weekend and acts on Monday after the first round", async () => {
    const stop = await place(f, { expiry: SATURDAY + 86400n * 5n });
    const buy = await place(f, { market: 1, kind: 1, amountIn: USDG("400"), trigger: usd("210"), expiry: SATURDAY + 86400n * 5n });
    await networkHelpers.time.increaseTo(SATURDAY);
    await setPrice(f, 0, usd("700"));
    await setPrice(f, 1, usd("190"));
    const weekend = await run();
    assert.equal(weekend.results.length, 0);
    assert.deepEqual(weekend.skipped, { "market-closed": 2 });

    // Monday 01:00:30 UTC, the open's forced rounds arrive.
    await networkHelpers.time.increaseTo(BigInt(Date.parse("2026-11-09T01:00:30Z") / 1000));
    await setPrice(f, 0, usd("700"));
    await setPrice(f, 1, usd("190"));
    const monday = await run();
    assert.deepEqual(monday.results.map((r) => r.ok), [true, true]);
    assert.equal((await f.lastbell.read.getOrder([stop])).status, Status.Filled);
    assert.equal((await f.lastbell.read.getOrder([buy])).status, Status.Filled);
  });

  it("won't claim when the pool can't meet min-out, so it never risks a slash", async () => {
    const id = await place(f, { slippageBps: 20 });
    await setPrice(f, 0, usd("735"));
    await f.router.write.setImpactBps([100n]);
    const report = await run();
    assert.equal(report.results[0]!.ok, false);
    assert.match(report.results[0]!.note ?? "", /min-out/);
    const o = await f.lastbell.read.getOrder([id]);
    assert.equal(o.claimer, "0x0000000000000000000000000000000000000000");
    assert.equal((await f.lastbell.read.keepers([f.keeper.account.address]))[3], 0); // no slashes
  });

  it("refunds expired orders to their owners", async () => {
    const id = await place(f, { expiry: (await now(f)) + 600n, amountIn: STOCK("1.5") });
    await networkHelpers.time.increase(700);
    const before = await f.spy.read.balanceOf([f.alice.account.address]);
    const report = await run();
    assert.deepEqual(report.results.map((r) => [r.kind, r.ok]), [["refund-expired", true]]);
    assert.equal((await f.lastbell.read.getOrder([id])).status, Status.Cancelled);
    assert.equal((await f.spy.read.balanceOf([f.alice.account.address])) - before, STOCK("1.5"));
  });

  it("takes over an order another keeper claimed and abandoned, slashing them", async () => {
    await bondKeeper(f, f.keeper2);
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper2.account });
    await networkHelpers.time.increase(PARAMS.claimWindow + 5);
    await setPrice(f, 0, usd("735"));
    const report = await run();
    assert.equal(report.results[0]!.ok, true, report.results[0]!.note);
    assert.equal((await f.lastbell.read.keepers([f.keeper2.account.address]))[3], 1);
    assert.equal((await f.lastbell.read.getOrder([id])).status, Status.Filled);
  });
});
