import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  Kind, PARAMS, STOCK, Status, USDG, WIF, bondKeeper, deployFixture, networkHelpers, now, place, setPrice, usd, viem,
  type Fixture,
} from "./fixture.js";

describe("constructor", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
  });

  const deployWith = (f: Fixture, p: Partial<Record<string, unknown>> = {}, markets?: unknown[]) =>
    viem.deployContract("Lastbell", [
      {
        wif: f.wif.address,
        quote: f.usdg.address,
        router: f.router.address,
        ...PARAMS,
        ...p,
      } as never,
      (markets ?? [
        { token: f.spy.address, feed: f.spyFeed.address, pool: f.spyPool.address, heartbeat: 86400, maxDeviationBps: 150 },
      ]) as never,
    ]);

  it("rejects unsafe parameters", async () => {
    for (const bad of [
      { minFee: 1n },
      { claimWindow: 29 },
      { maxSlippageBps: 0 },
      { maxSlippageBps: 1001 },
      { slashAmount: 0n },
      { minBond: PARAMS.slashAmount - 1n },
      { quote: "0x0000000000000000000000000000000000000000" },
      { router: "0x0000000000000000000000000000000000000000" },
    ]) {
      await viem.assertions.revertWithCustomError(deployWith(f, bad), f.lastbell, "BadParams");
    }
  });

  it("rejects bad markets: none, wrong pool pair, zero heartbeat, band out of range", async () => {
    const m = { token: f.spy.address, feed: f.spyFeed.address, pool: f.spyPool.address, heartbeat: 86400, maxDeviationBps: 150 };
    await viem.assertions.revertWithCustomError(deployWith(f, {}, []), f.lastbell, "BadParams");
    await viem.assertions.revertWithCustomError(deployWith(f, {}, [{ ...m, pool: f.nvdaPool.address }]), f.lastbell, "BadParams");
    await viem.assertions.revertWithCustomError(deployWith(f, {}, [{ ...m, heartbeat: 0 }]), f.lastbell, "BadParams");
    await viem.assertions.revertWithCustomError(deployWith(f, {}, [{ ...m, maxDeviationBps: 0 }]), f.lastbell, "BadParams");
    await viem.assertions.revertWithCustomError(deployWith(f, {}, [{ ...m, maxDeviationBps: 2001 }]), f.lastbell, "BadParams");
  });

  it("records units and pool details from chain, not from input", async () => {
    const m = await f.lastbell.read.market([1]);
    assert.equal(m.stockUnit, 10n ** 18n);
    assert.equal(m.feedUnit, 10n ** 8n);
    assert.equal(m.poolFee, 500);
    assert.equal(await f.lastbell.read.quoteUnit(), 10n ** 6n);
    assert.equal(await f.lastbell.read.marketCount(), 2n);
    await viem.assertions.revertWithCustomError(f.lastbell.read.market([2]), f.lastbell, "UnknownMarket");
  });
});

describe("prepaid fees", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
  });

  it("deposits and withdraws, never more than the free balance", async () => {
    const { lastbell, alice } = f;
    await lastbell.write.depositFees([WIF("500")], { account: alice.account });
    assert.equal(await lastbell.read.feeBalance([alice.account.address]), WIF("500"));
    await viem.assertions.revertWithCustomError(
      lastbell.write.withdrawFees([WIF("501")], { account: alice.account }),
      lastbell,
      "InsufficientFees",
    );
    await viem.assertions.revertWithCustomError(lastbell.write.withdrawFees([0n], { account: alice.account }), lastbell, "ZeroAmount");
    await viem.assertions.revertWithCustomError(lastbell.write.depositFees([0n], { account: alice.account }), lastbell, "ZeroAmount");
    const before = await f.wif.read.balanceOf([alice.account.address]);
    await lastbell.write.withdrawFees([WIF("200")], { account: alice.account });
    assert.equal((await f.wif.read.balanceOf([alice.account.address])) - before, WIF("200"));
    assert.equal(await lastbell.read.feeBalance([alice.account.address]), WIF("300"));
    assert.equal(await lastbell.read.totalFeeHeld(), WIF("300"));
  });

  it("reserves the fee from the balance first, then pulls only the shortfall", async () => {
    const { lastbell, alice, wif } = f;
    await lastbell.write.depositFees([WIF("30")], { account: alice.account });
    const before = await wif.read.balanceOf([alice.account.address]);
    await place(f, { fee: WIF("100") });
    assert.equal(await lastbell.read.feeBalance([alice.account.address]), 0n);
    assert.equal(before - (await wif.read.balanceOf([alice.account.address])), WIF("70"));
    assert.equal(await lastbell.read.totalFeeHeld(), WIF("100"));

    await lastbell.write.depositFees([WIF("200")], { account: alice.account });
    const before2 = await wif.read.balanceOf([alice.account.address]);
    await place(f, { fee: WIF("150") });
    assert.equal(await wif.read.balanceOf([alice.account.address]), before2);
    assert.equal(await lastbell.read.feeBalance([alice.account.address]), WIF("50"));
  });
});

describe("placing orders", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
  });

  it("escrows stock for a stop-loss and USDG for a limit buy", async () => {
    const { lastbell, spy, usdg, alice } = f;
    const a = await place(f, { amountIn: STOCK("3") });
    const b = await place(f, { market: 1, kind: Kind.LimitBuy, amountIn: USDG("750"), trigger: usd("190") });
    assert.equal(await spy.read.balanceOf([lastbell.address]), STOCK("3"));
    assert.equal(await usdg.read.balanceOf([lastbell.address]), USDG("750"));
    assert.equal(await lastbell.read.escrowed([spy.address]), STOCK("3"));
    assert.equal(await lastbell.read.escrowed([usdg.address]), USDG("750"));
    const o = await lastbell.read.getOrder([b]);
    assert.equal(o.owner.toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(o.kind, Kind.LimitBuy);
    assert.equal(o.status, Status.Open);
    assert.deepEqual(await lastbell.read.ordersOf([alice.account.address]), [a, b]);
  });

  it("validates every field", async () => {
    const t0 = await now(f);
    const bad: Parameters<typeof place>[1][] = [
      { trigger: 0n },
      { slippageBps: PARAMS.maxSlippageBps + 1 },
      { expiry: t0 + BigInt(PARAMS.claimWindow) - 5n },
      { expiry: t0 + 181n * 86400n },
      { fee: PARAMS.minFee - 1n },
    ];
    for (const o of bad) await viem.assertions.revertWithCustomError(place(f, o), f.lastbell, "BadOrder");
    await viem.assertions.revertWithCustomError(place(f, { amountIn: 0n }), f.lastbell, "ZeroAmount");
    await viem.assertions.revertWithCustomError(place(f, { market: 5 }), f.lastbell, "UnknownMarket");
  });

  it("pages through orders", async () => {
    for (let i = 0; i < 5; i++) await place(f);
    const page = await f.lastbell.read.getOrders([3n, 10n]);
    assert.equal(page.length, 2);
    assert.equal((await f.lastbell.read.getOrders([9n, 3n])).length, 0);
    await viem.assertions.revertWithCustomError(f.lastbell.read.getOrder([5n]), f.lastbell, "UnknownOrder");
  });
});

describe("cancelling", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
  });

  it("lets the owner cancel at any time and returns everything", async () => {
    const { lastbell, spy, alice } = f;
    const before = await spy.read.balanceOf([alice.account.address]);
    const id = await place(f, { amountIn: STOCK("2"), fee: WIF("80") });
    await lastbell.write.cancel([id], { account: alice.account });
    assert.equal(await spy.read.balanceOf([alice.account.address]), before);
    assert.equal(await lastbell.read.feeBalance([alice.account.address]), WIF("80"));
    assert.equal(await lastbell.read.escrowed([spy.address]), 0n);
    await viem.assertions.revertWithCustomError(lastbell.write.cancel([id], { account: alice.account }), lastbell, "NotOpen");
  });

  it("only lets others cancel after expiry, and refunds the owner", async () => {
    const { lastbell, spy, alice, bob } = f;
    const id = await place(f, { expiry: (await now(f)) + 3600n });
    await viem.assertions.revertWithCustomError(lastbell.write.cancel([id], { account: bob.account }), lastbell, "NotOwner");
    await networkHelpers.time.increase(3601);
    const before = await spy.read.balanceOf([alice.account.address]);
    await lastbell.write.cancel([id], { account: bob.account });
    assert.equal((await spy.read.balanceOf([alice.account.address])) - before, STOCK("1"));
  });

  it("frees a keeper without penalty when the owner cancels mid-claim", async () => {
    const { lastbell, alice, keeper } = f;
    await bondKeeper(f);
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await lastbell.write.claim([id], { account: keeper.account });
    await lastbell.write.cancel([id], { account: alice.account });
    const k = await lastbell.read.keepers([keeper.account.address]);
    assert.equal(k[0], PARAMS.minBond);
    assert.equal(k[1], 0); // activeClaims
  });

  it("still lets the owner leave while the market is closed", async () => {
    const id = await place(f);
    await networkHelpers.time.increaseTo(BigInt(Date.parse("2026-11-08T12:00:00Z") / 1000));
    await f.lastbell.write.cancel([id], { account: f.alice.account });
    assert.equal((await f.lastbell.read.getOrder([id])).status, Status.Cancelled);
  });
});

describe("odd tokens", () => {
  it("records what actually arrived for fee-on-transfer tokens", async () => {
    const f = await networkHelpers.loadFixture(deployFixture);
    const taxed = await viem.deployContract("MockFeeOnTransferToken");
    const taxedWif = await viem.deployContract("MockFeeOnTransferToken");
    const pool = await viem.deployContract("MockUniswapV3Pool", [taxed.address, f.usdg.address, 500, 1n << 96n]);
    const lb = await viem.deployContract("Lastbell", [
      { wif: taxedWif.address, quote: f.usdg.address, router: f.router.address, ...PARAMS },
      [{ token: taxed.address, feed: f.spyFeed.address, pool: pool.address, heartbeat: 86400, maxDeviationBps: 150 }],
    ]);
    const { alice } = f;
    await taxed.write.mint([alice.account.address, STOCK("100")]);
    await taxedWif.write.mint([alice.account.address, WIF("1000000")]);
    await taxed.write.approve([lb.address, 2n ** 256n - 1n], { account: alice.account });
    await taxedWif.write.approve([lb.address, 2n ** 256n - 1n], { account: alice.account });

    // Fee shortfall can't be short-changed by a taxed fee token.
    await viem.assertions.revertWithCustomError(
      lb.write.placeOrder([0, Kind.StopLoss, STOCK("10"), usd("740"), 100, (await now(f)) + 86400n, PARAMS.minFee], {
        account: alice.account,
      }),
      lb,
      "InsufficientFees",
    );
    // Prepaid fees record the post-tax amount; escrow records the post-tax stock.
    await lb.write.depositFees([WIF("100")], { account: alice.account });
    assert.equal(await lb.read.feeBalance([alice.account.address]), WIF("99"));
    await lb.write.placeOrder([0, Kind.StopLoss, STOCK("10"), usd("740"), 100, (await now(f)) + 86400n, PARAMS.minFee], {
      account: alice.account,
    });
    assert.equal((await lb.read.getOrder([0n])).amountIn, STOCK("9.9"));
    assert.equal(await lb.read.escrowed([taxed.address]), STOCK("9.9"));
    assert.equal(await taxed.read.balanceOf([lb.address]), STOCK("9.9"));
    await lb.write.cancel([0n], { account: alice.account });
    assert.equal(await taxed.read.balanceOf([lb.address]), 0n);
  });
});
