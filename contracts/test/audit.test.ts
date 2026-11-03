// Audit regression tests: every finding from docs/AUDIT.md has a test here that fails on the pre-audit contract,
// plus attack tests for areas where the audit found nothing (reentrancy, decimals, rounding, griefing).
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { maxUint256, toFunctionSelector, zeroAddress } from "viem";
import {
  Gate, Kind, PARAMS, STOCK, Status, USDG, WEDNESDAY, WIF, bondKeeper, deployFixture, networkHelpers, now, place, setPrice, sqrtPriceFor, usd,
  viem, type Fixture,
} from "./fixture.js";

const GUARD = toFunctionSelector("ReentrancyGuardReentrantCall()");
const keeperOf = async (f: Fixture, who: Fixture["keeper"]) => {
  const [bond, activeClaims, fills, slashes] = await f.lastbell.read.keepers([who.account.address]);
  return { bond, activeClaims, fills, slashes };
};
const lapse = async (f: Fixture, market: 0 | 1, price: bigint) => {
  await networkHelpers.time.increase(PARAMS.claimWindow + 5);
  await setPrice(f, market, price); // a fresh round, so the gate is fresh when the claim is cleared
};

describe("audit F1: unfillable orders must not cost a keeper its bond", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
    await bondKeeper(f);
    await bondKeeper(f, f.keeper2);
  });

  it("refuses a dust order whose minimum output rounds to zero", async () => {
    await viem.assertions.revertWithCustomError(place(f, { amountIn: 1n, trigger: usd("760") }), f.lastbell, "BadOrder");
    // at a $760 trigger one raw USDG unit is worth about 1.3e9 raw stock units
    await viem.assertions.revertWithCustomError(place(f, { amountIn: 1_200_000_000n, trigger: usd("760"), slippageBps: 0 }), f.lastbell, "BadOrder");
    const id = await place(f, { amountIn: 1_400_000_000n, trigger: usd("760"), slippageBps: 0 });
    assert.equal((await f.lastbell.read.getOrder([id])).status, Status.Open);
  });

  it("a keeper that cannot fill releases the claim for free (zero-slippage order)", async () => {
    const id = await place(f, { slippageBps: 0, trigger: usd("760") });
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await viem.assertions.revertWith(f.lastbell.write.fill([id], { account: f.keeper.account }), "Too little received");
    await f.lastbell.write.release([id], { account: f.keeper.account });

    const k = await keeperOf(f, f.keeper);
    assert.equal(k.slashes, 0);
    assert.equal(k.activeClaims, 0);
    assert.equal(k.bond, PARAMS.minBond);
    assert.equal((await f.lastbell.read.getOrder([id])).claimer, zeroAddress);
    // another keeper can take it immediately, with no AlreadyClaimed and no slash for anyone
    await f.lastbell.write.claim([id], { account: f.keeper2.account });
    assert.equal((await keeperOf(f, f.keeper)).slashes, 0);
  });

  it("a keeper facing an owner blocked by the issuer releases instead of being slashed", async () => {
    const id = await place(f, { market: 1, kind: Kind.LimitBuy, amountIn: USDG("500"), trigger: usd("230") });
    await f.nvda.write.setBlocked([f.alice.account.address, true]);
    await setPrice(f, 1, usd("205"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await viem.assertions.revertWithCustomError(f.lastbell.write.fill([id], { account: f.keeper.account }), f.nvda, "Blocked");
    await f.lastbell.write.release([id], { account: f.keeper.account });
    assert.deepEqual(await keeperOf(f, f.keeper), { bond: PARAMS.minBond, activeClaims: 0, fills: 0, slashes: 0 });
    // the owner can still get everything back once the issuer unblocks them
    await f.nvda.write.setBlocked([f.alice.account.address, false]);
    await f.lastbell.write.cancel([id], { account: f.alice.account });
  });

  it("release only works while the window is open: a keeper that goes dark is still slashed", async () => {
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await lapse(f, 0, usd("735"));
    await viem.assertions.revertWithCustomError(f.lastbell.write.release([id], { account: f.keeper.account }), f.lastbell, "ClaimExpired");
    await f.lastbell.write.clearExpiredClaim([id]);
    assert.equal((await keeperOf(f, f.keeper)).slashes, 1);
  });

  it("only the current claimer can release, and only an open order", async () => {
    const id = await place(f);
    await viem.assertions.revertWithCustomError(f.lastbell.write.release([id], { account: f.keeper.account }), f.lastbell, "NotClaimer");
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    for (const who of [f.keeper2, f.alice, f.bob]) {
      await viem.assertions.revertWithCustomError(f.lastbell.write.release([id], { account: who.account }), f.lastbell, "NotClaimer");
    }
    await f.lastbell.write.fill([id], { account: f.keeper.account });
    await viem.assertions.revertWithCustomError(f.lastbell.write.release([id], { account: f.keeper.account }), f.lastbell, "NotOpen");
    assert.equal((await f.lastbell.read.getOrder([id])).status, Status.Filled);
  });

  it("releasing frees the keeper's bond for withdrawal", async () => {
    const id = await place(f, { slippageBps: 0, trigger: usd("760") });
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await viem.assertions.revertWithCustomError(f.lastbell.write.unbond([PARAMS.minBond], { account: f.keeper.account }), f.lastbell, "ClaimsLive");
    await f.lastbell.write.release([id], { account: f.keeper.account });
    await f.lastbell.write.unbond([PARAMS.minBond], { account: f.keeper.account });
  });
});

describe("audit F2: gate() never reverts, so users can always cancel", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
    await bondKeeper(f);
    await bondKeeper(f, f.keeper2);
  });

  it("issuer flag getters that revert read as a closed gate, and the owner can still cancel a lapsed claim", async () => {
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await lapse(f, 0, usd("735"));
    await f.spy.write.setBroken([true]);

    assert.equal((await f.lastbell.read.gate([0])).status, Gate.BadAnswer);
    await viem.assertions.revertWithCustomErrorWithArgs(
      f.lastbell.write.claim([id], { account: f.keeper2.account }),
      f.lastbell,
      "GateClosed",
      [Gate.BadAnswer],
    );
    const before = await f.spy.read.balanceOf([f.alice.account.address]);
    await f.lastbell.write.cancel([id], { account: f.alice.account });
    assert.equal((await f.spy.read.balanceOf([f.alice.account.address])) - before, STOCK("1"));
    // the gate was not fresh, so the lapsed keeper is released without a slash
    assert.deepEqual(await keeperOf(f, f.keeper), { bond: PARAMS.minBond, activeClaims: 0, fills: 0, slashes: 0 });
  });

  it("a pool whose slot0() reverts reads as out of band", async () => {
    await f.spyPool.write.setBroken([true]);
    const g = await f.lastbell.read.gate([0]);
    assert.equal(g.status, Gate.PoolOutOfBand);
    assert.equal(g.price, f.spyPrice);
    assert.equal(g.poolPrice, 0n);
  });

  it("absurd oracle answers close the gate without reverting", async () => {
    const t = await now(f);
    const MAX_INT = 2n ** 255n - 1n;
    await f.spyFeed.write.set([MAX_INT, t]);
    assert.equal((await f.lastbell.read.gate([0])).status, Gate.PoolOutOfBand);
    await f.spyFeed.write.set([-MAX_INT, t]);
    assert.equal((await f.lastbell.read.gate([0])).status, Gate.BadAnswer);
    await f.spyFeed.write.set([f.spyPrice, 2n ** 255n]);
    assert.equal((await f.lastbell.read.gate([0])).status, Gate.BadAnswer);
    await f.spyFeed.write.set([f.spyPrice, 0n]);
    assert.equal((await f.lastbell.read.gate([0])).status, Gate.BadAnswer);
  });
});

describe("audit: reentrancy (a hostile token calls back into Lastbell from its transfer hook)", () => {
  async function stack() {
    const f = await networkHelpers.loadFixture(deployFixture);
    const hostile = await viem.deployContract("MockHostileToken");
    const feed = await viem.deployContract("MockAggregator", [8, usd("200"), await now(f)]);
    const isToken0 = BigInt(hostile.address) < BigInt(f.usdg.address);
    const pool = await viem.deployContract("MockUniswapV3Pool", [hostile.address, f.usdg.address, 500, sqrtPriceFor(usd("200"), isToken0)]);
    await f.router.write.register([pool.address]);
    const lb = await viem.deployContract("Lastbell", [
      { wif: f.wif.address, quote: f.usdg.address, router: f.router.address, ...PARAMS },
      [{ token: hostile.address, feed: feed.address, pool: pool.address, heartbeat: 86400, maxDeviationBps: 150 }],
    ]);
    const attacker = await viem.deployContract("MockReentrancyAttacker", [lb.address]);
    await hostile.write.mint([attacker.address, STOCK("100")]);
    await f.wif.write.mint([attacker.address, WIF("10000")]);
    await attacker.write.approveAll([hostile.address]);
    await attacker.write.approveAll([f.wif.address]);
    await f.wif.write.approve([lb.address, maxUint256], { account: f.keeper.account });
    await lb.write.bond([PARAMS.minBond], { account: f.keeper.account });
    const expiry = (await now(f)) + 86400n * 3n;
    const place1 = () => attacker.write.place([0, STOCK("1"), usd("210"), 100, expiry, PARAMS.minFee]);
    return { f, hostile, lb, attacker, place1 };
  }

  it("cannot re-enter during placeOrder", async () => {
    const { hostile, lb, attacker, place1 } = await stack();
    await place1(); // order 0, hook disarmed
    await attacker.write.setVictim([0n]);
    await hostile.write.arm([attacker.address]);
    await place1(); // order 1: the hostile transferFrom calls attacker.reenter(), which tries to cancel order 0
    assert.ok((await hostile.read.hits()) > 0n);
    assert.equal(await attacker.read.lastOk(), false);
    assert.equal(await attacker.read.lastError(), GUARD);
    assert.equal((await lb.read.getOrder([0n])).status, Status.Open);
    assert.equal((await lb.read.getOrder([1n])).status, Status.Open);
    assert.equal(await lb.read.escrowed([hostile.address]), STOCK("2"));
  });

  it("cannot re-enter during the refund of cancel()", async () => {
    const { hostile, lb, attacker, place1 } = await stack();
    await place1();
    await place1();
    await attacker.write.setVictim([1n]);
    await hostile.write.arm([attacker.address]);
    await attacker.write.cancel([0n]); // the payout transfer calls back and tries to cancel order 1
    assert.equal(await attacker.read.lastOk(), false);
    assert.equal(await attacker.read.lastError(), GUARD);
    assert.equal((await lb.read.getOrder([0n])).status, Status.Cancelled);
    assert.equal((await lb.read.getOrder([1n])).status, Status.Open);
    assert.equal(await lb.read.escrowed([hostile.address]), STOCK("1"));
    assert.equal(await hostile.read.balanceOf([lb.address]), STOCK("1"));
  });

  it("cannot re-enter during the swap inside fill()", async () => {
    const { f, hostile, lb, attacker, place1 } = await stack();
    await place1(); // order 0 (will be filled)
    await place1(); // order 1 (the victim)
    await attacker.write.setVictim([1n]);
    await lb.write.claim([0n], { account: f.keeper.account });
    await hostile.write.arm([attacker.address]);
    await lb.write.fill([0n], { account: f.keeper.account }); // the router's transferFrom triggers the hook
    assert.ok((await hostile.read.hits()) > 0n);
    assert.equal(await attacker.read.lastOk(), false);
    assert.equal(await attacker.read.lastError(), GUARD);
    assert.equal((await lb.read.getOrder([0n])).status, Status.Filled);
    assert.equal((await lb.read.getOrder([1n])).status, Status.Open);
    assert.equal(await lb.read.escrowed([hostile.address]), STOCK("1"));
    assert.equal(await hostile.read.balanceOf([lb.address]), STOCK("1"));
  });
});

describe("audit: decimals", () => {
  it("handles an 8-decimal stock with an 18-decimal feed and a 6-decimal quote", async () => {
    const f = await networkHelpers.loadFixture(deployFixture);
    const stock = await viem.deployContract("MockStockToken8");
    const price18 = 200n * 10n ** 18n; // $200
    const feed = await viem.deployContract("MockAggregator", [18, price18, await now(f)]);
    // 1 raw stock unit = 1e-8 stock = $0.000002 = 2 raw USDG units
    const stockIsToken0 = BigInt(stock.address) < BigInt(f.usdg.address);
    const isqrt = (n: bigint) => {
      let x = n, y = (x + 1n) >> 1n;
      while (y < x) [x, y] = [y, (y + n / y) >> 1n];
      return x;
    };
    const sqrtP = stockIsToken0 ? isqrt(2n * 2n ** 192n) : isqrt(2n ** 192n / 2n);
    const pool = await viem.deployContract("MockUniswapV3Pool", [stock.address, f.usdg.address, 500, sqrtP]);
    await f.router.write.register([pool.address]);
    const lb = await viem.deployContract("Lastbell", [
      { wif: f.wif.address, quote: f.usdg.address, router: f.router.address, ...PARAMS },
      [{ token: stock.address, feed: feed.address, pool: pool.address, heartbeat: 86400, maxDeviationBps: 150 }],
    ]);
    const m = await lb.read.market([0]);
    assert.equal(m.stockUnit, 10n ** 8n);
    assert.equal(m.feedUnit, 10n ** 18n);

    const g = await lb.read.gate([0]);
    assert.equal(g.status, Gate.Fresh);
    assert.equal(g.price, price18);
    const drift = g.poolPrice > price18 ? g.poolPrice - price18 : price18 - g.poolPrice;
    assert.ok(drift * 1_000_000n < price18, `pool price ${g.poolPrice} vs feed ${price18}`);

    // 1.5 stock at $200 = $300; minus 1% slippage = $297 minimum
    await stock.write.mint([f.alice.account.address, 10n ** 9n]);
    await stock.write.approve([lb.address, maxUint256], { account: f.alice.account });
    await f.wif.write.approve([lb.address, maxUint256], { account: f.alice.account });
    await f.wif.write.approve([lb.address, maxUint256], { account: f.keeper.account });
    await lb.write.placeOrder([0, Kind.StopLoss, 150_000_000n, 210n * 10n ** 18n, 100, (await now(f)) + 86400n, PARAMS.minFee], { account: f.alice.account });
    const order = await lb.read.getOrder([0n]);
    assert.equal(await lb.read.minAmountOut([order, m, price18]), USDG("297"));

    await lb.write.bond([PARAMS.minBond], { account: f.keeper.account });
    await lb.write.claim([0n], { account: f.keeper.account });
    const before = await f.usdg.read.balanceOf([f.alice.account.address]);
    await lb.write.fill([0n], { account: f.keeper.account });
    const got = (await f.usdg.read.balanceOf([f.alice.account.address])) - before;
    assert.ok(got >= USDG("297") && got <= USDG("300"), `received ${got}`);
  });
});

describe("audit: rounding", () => {
  it("minAmountOut matches an exact reference for random amounts, prices and slippage and never over-promises", async () => {
    const f = await networkHelpers.loadFixture(deployFixture);
    const m = await f.lastbell.read.market([0]);
    let seed = 20261103;
    const rnd = (lo: bigint, hi: bigint) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return lo + (BigInt(seed) * (hi - lo)) / BigInt(2 ** 31);
    };
    const base = {
      owner: f.alice.account.address, expiry: 0n, market: 0, status: 1, claimer: zeroAddress, claimDeadline: 0n, fee: 0n, amountOut: 0n, slippageBps: 0,
    };
    for (let i = 0; i < 300; i++) {
      const stop = i % 2 === 0;
      const amountIn = stop ? rnd(10n ** 12n, 10n ** 22n) : rnd(10n ** 4n, 10n ** 11n);
      const trigger = rnd(10n ** 9n, 10n ** 13n);
      const price = rnd(10n ** 9n, 10n ** 13n);
      const slip = Number(rnd(0n, 301n));
      const order = { ...base, kind: stop ? 0 : 1, amountIn, triggerPrice: trigger, slippageBps: slip };
      const got = await f.lastbell.read.minAmountOut([order, m, price]);

      const keep = 10_000n - BigInt(slip);
      let expected: bigint;
      let exact: bigint; // exact rational value scaled up by 1e12 for a bound check
      if (stop) {
        expected = (((amountIn * price * 10n ** 6n) / (10n ** 18n * 10n ** 8n)) * keep) / 10_000n;
        exact = (amountIn * price * 10n ** 6n * keep * 10n ** 12n) / (10n ** 18n * 10n ** 8n * 10_000n);
      } else {
        const atLimit = (amountIn * 10n ** 18n * 10n ** 8n) / (trigger * 10n ** 6n);
        const atOracle = (((amountIn * 10n ** 18n * 10n ** 8n) / (price * 10n ** 6n)) * keep) / 10_000n;
        expected = atLimit > atOracle ? atLimit : atOracle;
        const exactLimit = (amountIn * 10n ** 18n * 10n ** 8n * 10n ** 12n) / (trigger * 10n ** 6n);
        const exactOracle = (amountIn * 10n ** 18n * 10n ** 8n * keep * 10n ** 12n) / (price * 10n ** 6n * 10_000n);
        exact = exactLimit > exactOracle ? exactLimit : exactOracle;
      }
      assert.equal(got, expected, `case ${i}`);
      // rounds down only: never above the exact value, and within 2 raw units of it
      assert.ok(got * 10n ** 12n <= exact + 10n ** 12n, `over-promised in case ${i}`);
      assert.ok(exact / 10n ** 12n - got <= 2n, `rounded too far in case ${i}: ${got} vs ${exact / 10n ** 12n}`);
    }
  });

  it("an odd fee never leaks: burned plus keeper payout equals the fee", async () => {
    const f = await networkHelpers.loadFixture(deployFixture);
    await bondKeeper(f);
    for (const extra of [1n, 3n, 7n, 99n]) {
      const id = await place(f, { fee: PARAMS.minFee + extra });
      await setPrice(f, 0, usd("735"));
      const burnedBefore = await f.lastbell.read.totalFeesBurned();
      const paidBefore = await f.lastbell.read.totalKeeperPaid();
      await f.lastbell.write.claim([id], { account: f.keeper.account });
      await f.lastbell.write.fill([id], { account: f.keeper.account });
      const burned = (await f.lastbell.read.totalFeesBurned()) - burnedBefore;
      const paid = (await f.lastbell.read.totalKeeperPaid()) - paidBefore;
      assert.equal(burned + paid, PARAMS.minFee + extra);
      assert.ok(paid >= burned && paid - burned <= 1n, "the keeper gets the odd unit");
      await setPrice(f, 0, usd("760"));
    }
  });
});

describe("audit: keeper griefing and slashing edges", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
    await bondKeeper(f);
    await bondKeeper(f, f.keeper2);
  });

  it("a keeper hoarding claims it never fills pays a slash for every one", async () => {
    const ids = [await place(f), await place(f), await place(f)];
    await setPrice(f, 0, usd("735"));
    for (const id of ids) await f.lastbell.write.claim([id], { account: f.keeper.account });
    await lapse(f, 0, usd("735"));
    for (const id of ids) await f.lastbell.write.claim([id], { account: f.keeper2.account });
    const k = await keeperOf(f, f.keeper);
    assert.equal(k.slashes, 3);
    assert.equal(k.bond, PARAMS.minBond - 3n * PARAMS.slashAmount);
    assert.equal(k.activeClaims, 0);
  });

  it("a slashed keeper can still fill its other live claim, but cannot claim anew until it tops up", async () => {
    const [a, b, d] = [await place(f), await place(f), await place(f)];
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([a], { account: f.keeper.account }); // window ends at T+120
    await networkHelpers.time.increase(100);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([b], { account: f.keeper.account }); // window ends at T+220
    await networkHelpers.time.increase(25); // T+125: a has lapsed, b is live
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.clearExpiredClaim([a]);

    let k = await keeperOf(f, f.keeper);
    assert.equal(k.slashes, 1);
    assert.equal(k.bond, PARAMS.minBond - PARAMS.slashAmount);
    assert.equal(k.activeClaims, 1);
    assert.equal(await f.lastbell.read.isActiveKeeper([f.keeper.account.address]), false);
    await viem.assertions.revertWithCustomError(f.lastbell.write.claim([d], { account: f.keeper.account }), f.lastbell, "NotKeeper");
    await f.lastbell.write.fill([b], { account: f.keeper.account }); // live claim still honoured
    assert.equal((await f.lastbell.read.getOrder([b])).status, Status.Filled);

    await f.lastbell.write.bond([PARAMS.slashAmount], { account: f.keeper.account });
    assert.equal(await f.lastbell.read.isActiveKeeper([f.keeper.account.address]), true);
    await f.lastbell.write.claim([d], { account: f.keeper.account });
    k = await keeperOf(f, f.keeper);
    assert.ok(BigInt(k.activeClaims) <= k.bond / PARAMS.slashAmount, "claims never exceed what the bond can cover");
  });

  it("an owner cannot slash a keeper by cancelling mid-window, and cannot dodge slashing by cancelling after it", async () => {
    const a = await place(f);
    const b = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([a], { account: f.keeper.account });
    await f.lastbell.write.claim([b], { account: f.keeper.account });
    await f.lastbell.write.cancel([a], { account: f.alice.account }); // mid-window
    assert.equal((await keeperOf(f, f.keeper)).slashes, 0);
    await lapse(f, 0, usd("735"));
    await f.lastbell.write.cancel([b], { account: f.alice.account }); // after the window, gate fresh: the idle keeper pays
    assert.equal((await keeperOf(f, f.keeper)).slashes, 1);
  });

  it("a keeper whose claim lapsed while the market was closed is not slashed, and then frees its own bond", async () => {
    const id = await place(f, { expiry: BigInt(Date.parse("2026-11-12T00:00:00Z") / 1000) });
    await networkHelpers.time.increaseTo(BigInt(Date.parse("2026-11-07T00:59:00Z") / 1000)); // Fri 19:59 EST
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await networkHelpers.time.increaseTo(BigInt(Date.parse("2026-11-07T01:10:00Z") / 1000)); // closed
    await f.lastbell.write.clearExpiredClaim([id], { account: f.keeper.account });
    assert.equal((await keeperOf(f, f.keeper)).slashes, 0);
    await f.lastbell.write.unbond([PARAMS.minBond], { account: f.keeper.account });
  });

  it("an attacker cannot take a claim from a live keeper or fill an order they did not claim", async () => {
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await viem.assertions.revertWithCustomError(f.lastbell.write.claim([id], { account: f.keeper2.account }), f.lastbell, "AlreadyClaimed");
    await viem.assertions.revertWithCustomError(f.lastbell.write.fill([id], { account: f.keeper2.account }), f.lastbell, "NotClaimer");
    await viem.assertions.revertWithCustomError(f.lastbell.write.clearExpiredClaim([id], { account: f.bob.account }), f.lastbell, "ClaimNotExpired");
  });
});
