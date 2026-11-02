import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { decodeEventLog } from "viem";
import {
  Kind, PARAMS, Status, USDG, WIF, bondKeeper, deployFixture, networkHelpers, now, place, setPrice, t, usd, viem,
  type Fixture,
} from "./fixture.js";

const keeperOf = async (f: Fixture, who: Fixture["keeper"]) => {
  const [bond, activeClaims, fills, slashes] = await f.lastbell.read.keepers([who.account.address]);
  return { bond, activeClaims, fills, slashes };
};

describe("keeper bond", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
  });

  it("needs at least minBond and tracks capacity", async () => {
    const { lastbell, keeper } = f;
    await viem.assertions.revertWithCustomError(bondKeeper(f, keeper, PARAMS.minBond - 1n), lastbell, "BondTooSmall");
    await bondKeeper(f);
    assert.equal(await lastbell.read.isActiveKeeper([keeper.account.address]), true);
    assert.equal(await lastbell.read.claimCapacity([keeper.account.address]), PARAMS.minBond / PARAMS.slashAmount);
    await bondKeeper(f, keeper, WIF("5")); // top-ups of any size once above the minimum
    assert.equal(await lastbell.read.totalBonded(), PARAMS.minBond + WIF("5"));
  });

  it("unbonds fully or down to minBond, never in between", async () => {
    const { lastbell, keeper, wif } = f;
    await bondKeeper(f, keeper, PARAMS.minBond * 2n);
    await viem.assertions.revertWithCustomError(lastbell.write.unbond([0n], { account: keeper.account }), lastbell, "ZeroAmount");
    await viem.assertions.revertWithCustomError(
      lastbell.write.unbond([PARAMS.minBond * 2n + 1n], { account: keeper.account }),
      lastbell,
      "InsufficientBond",
    );
    await viem.assertions.revertWithCustomError(
      lastbell.write.unbond([PARAMS.minBond + 1n], { account: keeper.account }),
      lastbell,
      "BondTooSmall",
    );
    await lastbell.write.unbond([PARAMS.minBond], { account: keeper.account });
    const before = await wif.read.balanceOf([keeper.account.address]);
    await lastbell.write.unbond([PARAMS.minBond], { account: keeper.account });
    assert.equal((await wif.read.balanceOf([keeper.account.address])) - before, PARAMS.minBond);
    assert.equal(await lastbell.read.totalBonded(), 0n);
  });

  it("locks the whole bond while any claim is live", async () => {
    const { lastbell, keeper } = f;
    await bondKeeper(f, keeper, PARAMS.minBond * 2n);
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await lastbell.write.claim([id], { account: keeper.account });
    await viem.assertions.revertWithCustomError(lastbell.write.unbond([PARAMS.minBond], { account: keeper.account }), lastbell, "ClaimsLive");
    await lastbell.write.fill([id], { account: keeper.account });
    await lastbell.write.unbond([PARAMS.minBond * 2n], { account: keeper.account });
  });
});

describe("claiming", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
    await bondKeeper(f);
  });

  it("requires a bonded keeper", async () => {
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await viem.assertions.revertWithCustomError(f.lastbell.write.claim([id], { account: f.bob.account }), f.lastbell, "NotKeeper");
  });

  it("requires the trigger to be met at the fresh oracle price", async () => {
    const id = await place(f, { trigger: usd("740") });
    await setPrice(f, 0, usd("740.00000001"));
    await viem.assertions.revertWithCustomError(f.lastbell.write.claim([id], { account: f.keeper.account }), f.lastbell, "NotTriggered");
    await setPrice(f, 0, usd("740"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
  });

  it("won't claim an order that expires inside the claim window", async () => {
    const id = await place(f, { expiry: (await now(f)) + BigInt(PARAMS.claimWindow) + 10n });
    await setPrice(f, 0, usd("735"));
    await networkHelpers.time.increase(20);
    await viem.assertions.revertWithCustomError(f.lastbell.write.claim([id], { account: f.keeper.account }), f.lastbell, "Expired");
  });

  it("gives the claimer exclusivity for the window", async () => {
    await bondKeeper(f, f.keeper2);
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await viem.assertions.revertWithCustomError(f.lastbell.write.claim([id], { account: f.keeper2.account }), f.lastbell, "AlreadyClaimed");
    await viem.assertions.revertWithCustomError(f.lastbell.write.fill([id], { account: f.keeper2.account }), f.lastbell, "NotClaimer");
  });

  it("caps live claims at bond / slashAmount so every claim stays slashable", async () => {
    const cap = Number(PARAMS.minBond / PARAMS.slashAmount);
    const ids = [];
    for (let i = 0; i <= cap; i++) ids.push(await place(f));
    await setPrice(f, 0, usd("735"));
    for (let i = 0; i < cap; i++) await f.lastbell.write.claim([ids[i]!], { account: f.keeper.account });
    await viem.assertions.revertWithCustomError(f.lastbell.write.claim([ids[cap]!], { account: f.keeper.account }), f.lastbell, "AtCapacity");
    assert.equal((await keeperOf(f, f.keeper)).activeClaims, cap);
  });
});

describe("filling", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
    await bondKeeper(f);
  });

  it("splits an odd fee so burned + paid == fee exactly", async () => {
    const fee = PARAMS.minFee + 1n;
    const id = await place(f, { fee });
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    const hash = await f.lastbell.write.fill([id], { account: f.keeper.account });
    const receipt = await f.publicClient.getTransactionReceipt({ hash });
    const ev = receipt.logs
      .map((l) => {
        try {
          return decodeEventLog({ abi: f.lastbell.abi, data: l.data, topics: l.topics });
        } catch {
          return null;
        }
      })
      .find((e) => e?.eventName === "OrderFilled");
    assert.ok(ev && ev.eventName === "OrderFilled");
    assert.equal(ev.args.feeBurned + ev.args.keeperFee, fee);
    assert.equal(ev.args.feeBurned, fee / 2n);
    assert.equal(await f.lastbell.read.totalFeeHeld(), 0n);
    assert.equal((await keeperOf(f, f.keeper)).fills, 1);
  });

  it("rejects fills after the window", async () => {
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await networkHelpers.time.increase(PARAMS.claimWindow + 1);
    await viem.assertions.revertWithCustomError(f.lastbell.write.fill([id], { account: f.keeper.account }), f.lastbell, "ClaimExpired");
  });

  it("re-checks the gate at fill time", async () => {
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await f.spy.write.setOraclePaused([true]);
    await viem.assertions.revertWithCustomErrorWithArgs(f.lastbell.write.fill([id], { account: f.keeper.account }), f.lastbell, "GateClosed", [2]);
  });

  it("refuses a swap that loses more than the user's slippage", async () => {
    const id = await place(f, { slippageBps: 50 });
    await setPrice(f, 0, usd("735"));
    await f.router.write.setImpactBps([60n]); // 0.05% pool fee + 0.60% impact > 0.50% allowed
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await viem.assertions.revertWith(f.lastbell.write.fill([id], { account: f.keeper.account }), "Too little received");
    await f.router.write.setImpactBps([30n]);
    await f.lastbell.write.fill([id], { account: f.keeper.account });
  });

  it("catches a router that ignores min-out, by checking the owner's balance itself", async () => {
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.router.write.setCheat([true]);
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await viem.assertions.revertWithCustomError(f.lastbell.write.fill([id], { account: f.keeper.account }), f.lastbell, "BadSwap");
    assert.equal((await f.lastbell.read.getOrder([id])).status, Status.Open);
  });

  it("never buys above the limit, even when the oracle is below it", async () => {
    const id = await place(f, { market: 1, kind: Kind.LimitBuy, amountIn: USDG("1000"), trigger: usd("200"), slippageBps: 300 });
    // Oracle 199 triggers, but the pool sells at ~201.5 (inside the 1.5% band): that would pay above 200.
    await setPrice(f, 1, usd("199"), { poolPrice8: usd("201.5") });
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await viem.assertions.revertWith(f.lastbell.write.fill([id], { account: f.keeper.account }), "Too little received");
  });

  it("treats a triggered stop as a market order: it still sells if the price bounces before the fill", async () => {
    const id = await place(f, { trigger: usd("740") });
    await setPrice(f, 0, usd("739"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await setPrice(f, 0, usd("745"));
    await f.lastbell.write.fill([id], { account: f.keeper.account });
    const o = await f.lastbell.read.getOrder([id]);
    assert.equal(o.status, Status.Filled);
    assert.ok(o.amountOut >= (USDG("745") * 99n) / 100n); // min-out uses the price at fill time
  });
});

describe("slashing", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployFixture);
    await bondKeeper(f);
    await bondKeeper(f, f.keeper2);
  });

  it("burns the idle claimer's bond when another keeper takes over a fillable order", async () => {
    const id = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await networkHelpers.time.increase(PARAMS.claimWindow + 1);
    await setPrice(f, 0, usd("735"));
    const supply = await f.wif.read.totalSupply();
    await f.lastbell.write.claim([id], { account: f.keeper2.account });
    const k = await keeperOf(f, f.keeper);
    assert.equal(k.bond, PARAMS.minBond - PARAMS.slashAmount);
    assert.equal(k.activeClaims, 0);
    assert.equal(k.slashes, 1);
    assert.equal(supply - (await f.wif.read.totalSupply()), PARAMS.slashAmount);
    assert.equal(await f.lastbell.read.totalSlashed(), PARAMS.slashAmount);
    assert.equal(await f.lastbell.read.totalBonded(), PARAMS.minBond * 2n - PARAMS.slashAmount);
    // The slashed keeper is now below minBond and can't claim again until topping up.
    assert.equal(await f.lastbell.read.isActiveKeeper([f.keeper.account.address]), false);
  });

  it("clearExpiredClaim: only after the window, only with a claim", async () => {
    const id = await place(f);
    await viem.assertions.revertWithCustomError(f.lastbell.write.clearExpiredClaim([id]), f.lastbell, "NoClaim");
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await viem.assertions.revertWithCustomError(f.lastbell.write.clearExpiredClaim([id]), f.lastbell, "ClaimNotExpired");
    await networkHelpers.time.increase(PARAMS.claimWindow + 1);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.clearExpiredClaim([id], { account: f.bob.account });
    assert.equal((await keeperOf(f, f.keeper)).slashes, 1);
    assert.equal((await f.lastbell.read.getOrder([id])).claimer, "0x0000000000000000000000000000000000000000");
  });

  it("releases without penalty when the market closed during the window", async () => {
    const id = await place(f, { expiry: t("2026-11-12T00:00:00Z") });
    await networkHelpers.time.increaseTo(t("2026-11-07T00:58:00Z")); // Fri 19:58 EST
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([id], { account: f.keeper.account });
    await networkHelpers.time.increaseTo(t("2026-11-07T01:05:00Z")); // closed
    await f.lastbell.write.clearExpiredClaim([id]);
    const k = await keeperOf(f, f.keeper);
    assert.equal(k.bond, PARAMS.minBond);
    assert.equal(k.slashes, 0);
    assert.equal(k.activeClaims, 0);
  });

  it("slashes on cancel after an idle window, but not on cancel mid-window", async () => {
    const a = await place(f);
    const b = await place(f);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.claim([a], { account: f.keeper.account });
    await f.lastbell.write.claim([b], { account: f.keeper.account });
    await f.lastbell.write.cancel([a], { account: f.alice.account }); // mid-window: free
    await networkHelpers.time.increase(PARAMS.claimWindow + 1);
    await setPrice(f, 0, usd("735"));
    await f.lastbell.write.cancel([b], { account: f.alice.account }); // idle while fillable: slash
    const k = await keeperOf(f, f.keeper);
    assert.equal(k.slashes, 1);
    assert.equal(k.activeClaims, 0);
    assert.equal(await f.spy.read.balanceOf([f.lastbell.address]), 0n);
    assert.equal(await f.lastbell.read.escrowed([f.spy.address]), 0n);
  });
});
