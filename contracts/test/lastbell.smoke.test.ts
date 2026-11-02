import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  Gate, Kind, PARAMS, SATURDAY, STOCK, Status, USDG, WEDNESDAY, WIF,
  deployFixture, networkHelpers, sqrtPriceFor, usd, viem, type Fixture,
} from "./fixture.js";

describe("Lastbell smoke", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
  });

  it("covers both pool orientations and reads pool prices close to the feed", async () => {
    const spy = await f.lastbell.read.market([0]);
    const nvda = await f.lastbell.read.market([1]);
    assert.equal(spy.stockIsToken0, true);
    assert.equal(nvda.stockIsToken0, false);
    for (const [id, price] of [[0, f.spyPrice], [1, f.nvdaPrice]] as const) {
      const g = await f.lastbell.read.gate([id]);
      assert.equal(g.status, Gate.Fresh);
      assert.equal(g.price, price);
      const drift = g.poolPrice > price ? g.poolPrice - price : price - g.poolPrice;
      assert.ok(drift * 1_000_000n < price, `pool ${g.poolPrice} vs feed ${price}`);
    }
  });

  it("runs a stop-loss end to end: place, trigger, claim, fill, burn half the fee", async () => {
    const { lastbell, alice, keeper, wif, usdg, spy, spyFeed, spyPool, publicClient } = f;
    await lastbell.write.bond([PARAMS.minBond], { account: keeper.account });

    const fee = WIF("100");
    await lastbell.write.placeOrder([0, Kind.StopLoss, STOCK("2"), usd("740"), 100, WEDNESDAY + 86400n, fee], {
      account: alice.account,
    });
    assert.equal(await spy.read.balanceOf([lastbell.address]), STOCK("2"));

    // Not triggered yet at 758.
    await viem.assertions.revertWithCustomError(lastbell.write.claim([0n], { account: keeper.account }), lastbell, "NotTriggered");

    // Price falls to 735 on a fresh round; the pool follows.
    const now = BigInt((await publicClient.getBlock()).timestamp);
    await spyFeed.write.set([usd("735"), now]);
    await spyPool.write.setSqrtPriceX96([sqrtPriceFor(usd("735"), true)]);

    await lastbell.write.claim([0n], { account: keeper.account });
    const supplyBefore = await wif.read.totalSupply();
    const keeperWifBefore = await wif.read.balanceOf([keeper.account.address]);
    const aliceUsdgBefore = await usdg.read.balanceOf([alice.account.address]);
    await lastbell.write.fill([0n], { account: keeper.account });

    const order = await lastbell.read.getOrder([0n]);
    assert.equal(order.status, Status.Filled);
    // 2 x 735 = 1470 USDG minus the 0.05% pool fee; min-out allowed 1% slippage.
    const received = (await usdg.read.balanceOf([alice.account.address])) - aliceUsdgBefore;
    assert.equal(received, order.amountOut);
    assert.ok(received >= (USDG("1470") * 99n) / 100n && received <= USDG("1470"));
    assert.equal(supplyBefore - (await wif.read.totalSupply()), fee / 2n);
    assert.equal((await wif.read.balanceOf([keeper.account.address])) - keeperWifBefore, fee / 2n);
    assert.equal(await lastbell.read.totalFeesBurned(), fee / 2n);
    assert.equal(await lastbell.read.escrowed([spy.address]), 0n);
  });

  it("runs a limit buy end to end and never pays above the limit", async () => {
    const { lastbell, bob, keeper, nvda, nvdaFeed, nvdaPool, publicClient } = f;
    await lastbell.write.bond([PARAMS.minBond], { account: keeper.account });
    await lastbell.write.placeOrder([1, Kind.LimitBuy, USDG("1000"), usd("200"), 50, WEDNESDAY + 86400n, WIF("50")], {
      account: bob.account,
    });

    const now = BigInt((await publicClient.getBlock()).timestamp);
    await nvdaFeed.write.set([usd("199"), now]);
    await nvdaPool.write.setSqrtPriceX96([sqrtPriceFor(usd("199"), false)]);
    await lastbell.write.claim([0n], { account: keeper.account });
    const before = await nvda.read.balanceOf([bob.account.address]);
    await lastbell.write.fill([0n], { account: keeper.account });
    const got = (await nvda.read.balanceOf([bob.account.address])) - before;
    assert.ok(got >= (USDG("1000") * 10n ** 20n) / usd("200"), "bought at or below the limit");
  });

  it("queues on the weekend even though the price is younger than the heartbeat", async () => {
    const { lastbell, alice, keeper, spyFeed, spyPool } = f;
    await lastbell.write.bond([PARAMS.minBond], { account: keeper.account });
    await lastbell.write.placeOrder([0, Kind.StopLoss, STOCK("1"), usd("740"), 100, SATURDAY + 86400n * 3n, WIF("50")], {
      account: alice.account,
    });
    // Friday 19:30 EST round below the trigger, then it's Saturday.
    await spyFeed.write.set([usd("730"), BigInt(Date.parse("2026-11-07T00:30:00Z") / 1000)]);
    await spyPool.write.setSqrtPriceX96([sqrtPriceFor(usd("730"), true)]);
    await networkHelpers.time.increaseTo(SATURDAY);

    assert.equal((await lastbell.read.gate([0])).status, Gate.MarketClosed);
    await viem.assertions.revertWithCustomErrorWithArgs(
      lastbell.write.claim([0n], { account: keeper.account }),
      lastbell,
      "GateClosed",
      [Gate.MarketClosed],
    );
    // The owner can still leave at any time.
    await lastbell.write.cancel([0n], { account: alice.account });
    assert.equal((await lastbell.read.getOrder([0n])).status, Status.Cancelled);
    assert.equal(await lastbell.read.feeBalance([alice.account.address]), WIF("50"));
  });
});
