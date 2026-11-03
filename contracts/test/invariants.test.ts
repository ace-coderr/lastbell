// Randomized sequence tests. Each run drives a seeded random mix of user, keeper, price and clock
// actions against the contract and checks every invariant after every step. Expected gate results come
// from an independent reference model (IANA time zone database + the NYSE list), not from contract code.
//
//   INVARIANT_SEEDS=20 INVARIANT_STEPS=300 npx hardhat test test/invariants.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Kind, PARAMS, STOCK, Status, USDG, WIF, deployFixture, networkHelpers, sqrtPriceFor, type Fixture,
} from "./fixture.js";

const SEEDS = Number(process.env.INVARIANT_SEEDS ?? 6);
const STEPS = Number(process.env.INVARIANT_STEPS ?? 200);
const HEARTBEAT = 86400;
const BAND_BPS = 150n;

// ---------------------------------------------------------------- independent reference for the gate

const NYSE_HOLIDAYS = new Set([
  "2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26",
]);
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
});
function refOpen(ts: number): boolean {
  const p = Object.fromEntries(fmt.formatToParts(ts * 1000).map((x) => [x.type, x.value]));
  const base = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const trading = new Date(base + (Number(p.hour) >= 20 ? 86400000 : 0));
  const wd = trading.getUTCDay();
  return wd >= 1 && wd <= 5 && !NYSE_HOLIDAYS.has(trading.toISOString().slice(0, 10));
}
/** Session edges fall on whole UTC hours, so walking back hour by hour finds the stretch start. */
function refSessionStart(ts: number): number {
  let a = Math.floor(ts / 3600) * 3600;
  while (refOpen(a - 3600)) a -= 3600;
  return a;
}

interface MarketModel {
  price: bigint;
  updatedAt: number;
  poolPrice: bigint;
  oraclePaused: boolean;
  tokenPaused: boolean;
}

function refFresh(m: MarketModel, ts: number): boolean {
  if (!refOpen(ts) || m.oraclePaused || m.tokenPaused) return false;
  if (m.price <= 0n || m.updatedAt === 0 || m.updatedAt > ts) return false;
  if (m.updatedAt < refSessionStart(ts)) return false;
  if (ts - m.updatedAt > HEARTBEAT + PARAMS.graceSeconds) return false;
  const diff = m.poolPrice > m.price ? m.poolPrice - m.price : m.price - m.poolPrice;
  return diff * 10_000n <= BAND_BPS * m.price;
}

function refMinOut(o: OrderModel, price: bigint): bigint {
  const keep = 10_000n - BigInt(o.slippageBps);
  if (o.kind === Kind.StopLoss) return ((o.amountIn * price * 10n ** 6n) / 10n ** 26n) * keep / 10_000n;
  const atLimit = (o.amountIn * 10n ** 26n) / (o.trigger * 10n ** 6n);
  const atOracle = ((o.amountIn * 10n ** 26n) / (price * 10n ** 6n)) * keep / 10_000n;
  return atLimit > atOracle ? atLimit : atOracle;
}

// ---------------------------------------------------------------- model

interface OrderModel {
  id: bigint;
  owner: `0x${string}`;
  market: 0 | 1;
  kind: number;
  amountIn: bigint;
  trigger: bigint;
  slippageBps: number;
  expiry: number;
  fee: bigint;
  status: number;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const totals = { releases: 0, steps: 0, placed: 0, claims: 0, fills: 0, cancels: 0, slashes: 0, closedClaimAttempts: 0, rejectedUnbondsWithClaims: 0 };

async function run(seed: number) {
  const f: Fixture = await networkHelpers.loadFixture(deployFixture);
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const lb = f.lastbell;
  const users = [f.alice, f.bob];
  const keepers = [f.keeper, f.keeper2];
  const stocks = [f.spy, f.nvda] as const;
  const feeds = [f.spyFeed, f.nvdaFeed] as const;
  const pools = [f.spyPool, f.nvdaPool] as const;
  const now = async () => Number((await f.publicClient.getBlock()).timestamp);
  const txTime = async (hash: `0x${string}`) => {
    const r = await f.publicClient.getTransactionReceipt({ hash });
    return Number((await f.publicClient.getBlock({ blockNumber: r.blockNumber })).timestamp);
  };
  const attempt = async (p: Promise<`0x${string}`>) => {
    try {
      return await p;
    } catch {
      return null;
    }
  };
  const stockOf = (m: 0 | 1) => stocks[m];
  const balance = (token: "usdg" | 0 | 1, who: `0x${string}`) =>
    token === "usdg" ? f.usdg.read.balanceOf([who]) : stockOf(token).read.balanceOf([who]);

  const markets: MarketModel[] = [
    { price: f.spyPrice, updatedAt: Number((await feeds[0].read.latestRoundData())[3]), poolPrice: f.spyPrice, oraclePaused: false, tokenPaused: false },
    { price: f.nvdaPrice, updatedAt: Number((await feeds[1].read.latestRoundData())[3]), poolPrice: f.nvdaPrice, oraclePaused: false, tokenPaused: false },
  ];
  const orders: OrderModel[] = [];
  const initialSupply = await f.wif.read.totalSupply();
  await lb.write.bond([PARAMS.minBond], { account: f.keeper.account });
  await lb.write.bond([PARAMS.minBond * 3n], { account: f.keeper2.account });

  const ctx = (step: number, what: string) => `seed ${seed} step ${step}: ${what}`;

  async function checkInvariants(step: number) {
    const chain = await lb.read.getOrders([0n, BigInt(orders.length)]);
    // terminal statuses never change; model follows chain
    chain.forEach((o, i) => {
      const m = orders[i]!;
      if (m.status === Status.Filled || m.status === Status.Cancelled) assert.equal(o.status, m.status, ctx(step, `order ${i} left a terminal state`));
      m.status = o.status;
    });
    const open = chain.filter((o) => o.status === Status.Open);

    // escrow: contract balance == escrowed == Σ open order amounts, per token
    const tokenIn = (o: (typeof chain)[number]) => (o.kind === Kind.StopLoss ? (o.market as 0 | 1) : ("usdg" as const));
    for (const tok of [0, 1, "usdg"] as const) {
      const addr = tok === "usdg" ? f.usdg.address : stockOf(tok).address;
      const sum = open.filter((o) => tokenIn(o) === tok).reduce((a, o) => a + o.amountIn, 0n);
      assert.equal(await lb.read.escrowed([addr]), sum, ctx(step, `escrowed ${String(tok)}`));
      assert.equal(await balance(tok, lb.address), sum, ctx(step, `balance ${String(tok)}`));
    }

    // $WIF: held == bonds + fees; fees == balances + reserved; burns and payouts add up
    const [totalBonded, totalFeeHeld, burned, paid, slashed, fills] = await Promise.all([
      lb.read.totalBonded(), lb.read.totalFeeHeld(), lb.read.totalFeesBurned(), lb.read.totalKeeperPaid(),
      lb.read.totalSlashed(), lb.read.totalFills(),
    ]);
    assert.equal(await f.wif.read.balanceOf([lb.address]), totalBonded + totalFeeHeld, ctx(step, "WIF held"));
    let feeBalances = 0n;
    for (const u of users) feeBalances += await lb.read.feeBalance([u.account.address]);
    assert.equal(totalFeeHeld, feeBalances + open.reduce((a, o) => a + o.fee, 0n), ctx(step, "fee ledger"));
    const filled = chain.filter((o) => o.status === Status.Filled);
    assert.equal(fills, BigInt(filled.length), ctx(step, "fill count"));
    assert.equal(burned + paid, filled.reduce((a, o) => a + o.fee, 0n), ctx(step, "fees add up"));
    assert.equal(burned, filled.reduce((a, o) => a + o.fee / 2n, 0n), ctx(step, "half burned"));
    assert.equal(await f.wif.read.totalSupply(), initialSupply - burned - slashed, ctx(step, "supply only shrinks by burns"));

    // keepers: bonds add up, claims are counted and fully slashable
    let bonds = 0n;
    for (const k of keepers) {
      const [bond, activeClaims] = await lb.read.keepers([k.account.address]);
      bonds += bond;
      const live = open.filter((o) => o.claimer.toLowerCase() === k.account.address.toLowerCase()).length;
      assert.equal(activeClaims, live, ctx(step, "activeClaims"));
      assert.ok(BigInt(activeClaims) <= bond / PARAMS.slashAmount, ctx(step, "claims beyond capacity"));
    }
    assert.equal(bonds, totalBonded, ctx(step, "bond ledger"));
  }

  const ZERO = "0x0000000000000000000000000000000000000000";
  /** A keeper that cannot fill drops its live claim: allowed only inside the window, never slashed. */
  async function tryRelease(o: OrderModel, k: (typeof keepers)[number], step: number) {
    const slashesBefore = (await lb.read.keepers([k.account.address]))[3];
    const deadline = Number((await lb.read.getOrder([o.id])).claimDeadline);
    const hash = await attempt(lb.write.release([o.id], { account: k.account }));
    if (!hash) return;
    assert.ok((await txTime(hash)) <= deadline, ctx(step, "released after the window"));
    assert.equal((await lb.read.keepers([k.account.address]))[3], slashesBefore, ctx(step, "release slashed the keeper"));
    assert.equal((await lb.read.getOrder([o.id])).claimer, ZERO, ctx(step, "claim not cleared"));
    totals.releases++;
  }

  async function tryFill(o: OrderModel, k: (typeof keepers)[number], step: number) {
    const tokenOut = o.kind === Kind.StopLoss ? ("usdg" as const) : o.market;
    const before = await balance(tokenOut, o.owner);
    const hash = await attempt(lb.write.fill([o.id], { account: k.account }));
    if (!hash) return;
    const ts = await txTime(hash);
    const mm = markets[o.market]!;
    assert.ok(refFresh(mm, ts), ctx(step, `fill executed on a stale/paused/closed gate (ts ${ts})`));
    const got = (await balance(tokenOut, o.owner)) - before;
    const chainOrder = await lb.read.getOrder([o.id]);
    assert.equal(got, chainOrder.amountOut, ctx(step, "owner received what the order records"));
    assert.ok(got >= refMinOut(o, mm.price), ctx(step, "owner got less than min-out"));
    totals.fills++;
  }

  for (let step = 0; step < STEPS; step++) {
    totals.steps++;
    const r = rnd();
    const openOrders = orders.filter((o) => o.status === Status.Open);

    if (r < 0.12) {
      // place an order
      const u = pick(users);
      const market = pick([0, 1] as const);
      const kind = rnd() < 0.6 ? Kind.StopLoss : Kind.LimitBuy;
      const amountIn = kind === Kind.StopLoss ? STOCK(between(0.05, 4).toFixed(4)) : USDG(between(20, 2500).toFixed(2));
      const trigger = (markets[market]!.price * BigInt(Math.floor(between(9_700, 10_100)))) / 10_000n;
      const slippageBps = Math.floor(between(0, 301));
      const expiry = (await now()) + Math.floor(rnd() < 0.15 ? between(130, 1800) : between(3600, 6 * 86400));
      const fee = PARAMS.minFee + WIF(between(0, 100).toFixed(3));
      const id = await lb.read.orderCount();
      const hash = await attempt(lb.write.placeOrder([market, kind, amountIn, trigger, slippageBps, BigInt(expiry), fee], { account: u.account }));
      if (hash) {
        const o = await lb.read.getOrder([id]);
        orders.push({ id, owner: u.account.address, market, kind, amountIn: o.amountIn, trigger, slippageBps, expiry, fee, status: Status.Open });
        totals.placed++;
      } else {
        assert.ok(markets[market]!.tokenPaused && kind === Kind.StopLoss, ctx(step, "placeOrder failed unexpectedly"));
      }
    } else if (r < 0.3) {
      // move a market: new round (usually), sometimes stale or none; the pool drifts around it
      const m = pick([0, 1] as const);
      const mm = markets[m]!;
      const price = (mm.price * BigInt(Math.floor(between(9_800, 10_200)))) / 10_000n;
      let devBps = Math.floor(rnd() < 0.8 ? between(-60, 60) : between(-250, 250));
      if (Math.abs(devBps) >= 145 && Math.abs(devBps) <= 155) devBps = 0; // stay off the band edge
      const t0 = await now();
      const mode = rnd();
      const poolPrice = (price * BigInt(10_000 + devBps)) / 10_000n;
      if (mode < 0.95) {
        const updatedAt = mode < 0.9 ? t0 : t0 - Math.floor(between(0, 30 * 3600));
        await feeds[m].write.set([price, BigInt(updatedAt)]);
        mm.price = price;
        mm.updatedAt = updatedAt;
      }
      await pools[m].write.setSqrtPriceX96([sqrtPriceFor(poolPrice, m === 0)]);
      mm.poolPrice = poolPrice;
    } else if (r < 0.31) {
      // issuer flags: pauses are rare and short, as around a real corporate action
      const paused = ([0, 1] as const).filter((x) => markets[x]!.oraclePaused || markets[x]!.tokenPaused);
      const m = paused.length && rnd() < 0.7 ? pick(paused) : pick([0, 1] as const);
      if (markets[m]!.oraclePaused || (!markets[m]!.tokenPaused && rnd() < 0.5)) {
        markets[m]!.oraclePaused = !markets[m]!.oraclePaused;
        await stockOf(m).write.setOraclePaused([markets[m]!.oraclePaused]);
      } else {
        markets[m]!.tokenPaused = !markets[m]!.tokenPaused;
        await stockOf(m).write.setPaused([markets[m]!.tokenPaused]);
      }
    } else if (r < 0.4) {
      // the clock
      const x = rnd();
      const t0 = await now();
      if (!refOpen(t0) && rnd() < 0.6) {
        // skip ahead to shortly after the next open, as a waiting keeper would experience it
        let t1 = Math.ceil(t0 / 3600) * 3600;
        while (!refOpen(t1)) t1 += 3600;
        await networkHelpers.time.increaseTo(t1 + Math.floor(between(30, 3600)));
        // Chainlink pushes a round on every feed right at the open (observed on mainnet, 2 Nov 2026)
        if (rnd() < 0.8) {
          for (const m of [0, 1] as const) {
            await feeds[m].write.set([markets[m]!.price, BigInt(t1 + 30)]);
            markets[m]!.updatedAt = t1 + 30;
          }
        }
      } else {
        await networkHelpers.time.increase(Math.floor(x < 0.75 ? between(10, 1800) : x < 0.95 ? between(3600, 6 * 3600) : between(86400, 3 * 86400)));
      }
    } else if (r < 0.65 && openOrders.length) {
      // claim: keepers mostly go after orders that look triggered, then fill right away like a real bot
      // a real bot skips orders about to expire; 20% of attempts are deliberately sloppy
      const t0 = await now();
      const live = openOrders.filter((o) => o.expiry > t0 + PARAMS.claimWindow + 5);
      const triggered = live.filter((o) => markets[o.market]!.price <= o.trigger);
      const o = triggered.length && rnd() < 0.8 ? pick(triggered) : pick(openOrders);
      const active = [];
      for (const x of keepers) if (await lb.read.isActiveKeeper([x.account.address])) active.push(x);
      const k = active.length && rnd() < 0.8 ? pick(active) : pick(keepers);
      if (!refOpen((await now()) + 1)) totals.closedClaimAttempts++;
      const hash = await attempt(lb.write.claim([o.id], { account: k.account }));
      if (hash) {
        const ts = await txTime(hash);
        const mm = markets[o.market]!;
        assert.ok(refFresh(mm, ts), ctx(step, `claim succeeded on a gate the reference calls closed (ts ${ts})`));
        assert.ok(mm.price <= o.trigger, ctx(step, "claim succeeded untriggered"));
        assert.ok(ts + PARAMS.claimWindow <= o.expiry, ctx(step, "claim too close to expiry"));
        totals.claims++;
        const choice = rnd();
        if (choice < 0.55) await tryFill(o, k, step);
        else if (choice < 0.8) await tryRelease(o, k, step); // it found the fill would not work
      }
    } else if (r < 0.8 && openOrders.length) {
      // fill: usually a claimed order by its claimer, sometimes anything by anyone
      const claimed = [];
      for (const o of openOrders) {
        const c = (await lb.read.getOrder([o.id])).claimer.toLowerCase();
        const k = keepers.find((x) => x.account.address.toLowerCase() === c);
        if (k) claimed.push({ o, k });
      }
      const choice = claimed.length && rnd() < 0.85 ? pick(claimed) : { o: pick(openOrders), k: pick(keepers) };
      await tryFill(choice.o, choice.k, step);
    } else if (r < 0.88 && openOrders.length) {
      // cancel: owner usually, a stranger sometimes
      const o = pick(openOrders);
      const caller = rnd() < 0.75 ? users.find((u) => u.account.address === o.owner)! : pick([...users, ...keepers]);
      const tokenIn = o.kind === Kind.StopLoss ? o.market : ("usdg" as const);
      const [balBefore, feeBefore] = await Promise.all([balance(tokenIn, o.owner), lb.read.feeBalance([o.owner])]);
      const hash = await attempt(lb.write.cancel([o.id], { account: caller.account }));
      if (hash) {
        const ts = await txTime(hash);
        if (caller.account.address !== o.owner) assert.ok(ts > o.expiry, ctx(step, "stranger cancelled before expiry"));
        assert.equal((await balance(tokenIn, o.owner)) - balBefore, o.amountIn, ctx(step, "cancel refunded the exact escrow"));
        assert.equal((await lb.read.feeBalance([o.owner])) - feeBefore, o.fee, ctx(step, "cancel refunded the fee"));
        totals.cancels++;
      } else if (caller.account.address === o.owner) {
        assert.ok(o.kind === Kind.StopLoss && markets[o.market]!.tokenPaused, ctx(step, "owner could not cancel"));
      }
    } else if (r < 0.935 && openOrders.length) {
      if (rnd() < 0.5) {
        const claimed = [];
        for (const o of openOrders) {
          const c = (await lb.read.getOrder([o.id])).claimer.toLowerCase();
          const k = keepers.find((x) => x.account.address.toLowerCase() === c);
          if (k) claimed.push({ o, k });
        }
        if (claimed.length) {
          const { o, k } = pick(claimed);
          await tryRelease(o, k, step);
        }
      } else {
        await attempt(lb.write.clearExpiredClaim([pick(openOrders).id]));
      }
    } else if (r < 0.97) {
      // keeper bond changes; unbonding must fail while any claim is live (so try that often)
      const withClaims = [];
      for (const x of keepers) if ((await lb.read.keepers([x.account.address]))[1] > 0) withClaims.push(x);
      const k = withClaims.length && rnd() < 0.6 ? pick(withClaims) : pick(keepers);
      const [bond, activeClaims] = await lb.read.keepers([k.account.address]);
      if (bond >= PARAMS.minBond && rnd() < (withClaims.includes(k) ? 0.8 : 0.3)) {
        const hash = await attempt(lb.write.unbond([bond], { account: k.account }));
        if (activeClaims > 0) {
          assert.equal(hash, null, ctx(step, "unbonded while a claim was live"));
          totals.rejectedUnbondsWithClaims++;
        } else {
          assert.ok(hash, ctx(step, "could not unbond with no live claims"));
        }
      } else {
        // top up to the minimum (after an exit or a slash) or add a little
        await lb.write.bond([bond < PARAMS.minBond ? PARAMS.minBond - bond : WIF("1000")], { account: k.account });
      }
    } else {
      // prepaid fees
      const u = pick(users);
      if (rnd() < 0.6) await lb.write.depositFees([WIF(between(1, 300).toFixed(2))], { account: u.account });
      else {
        const bal = await lb.read.feeBalance([u.account.address]);
        if (bal > 0n) await lb.write.withdrawFees([bal / 2n + 1n], { account: u.account });
      }
    }

    await checkInvariants(step);
  }
  totals.slashes += Number((await lb.read.totalSlashed()) / PARAMS.slashAmount);
}

describe("randomized invariants", () => {
  for (let s = 0; s < SEEDS; s++) {
    const seed = 0x1a57be11 + s * 7919;
    it(`seed ${seed}: ${STEPS} random steps keep every invariant`, async () => {
      await run(seed);
    });
  }

  it("actually exercised the interesting paths", () => {
    console.log("    coverage:", JSON.stringify(totals));
    assert.ok(totals.fills >= 4 * SEEDS, "too few fills");
    assert.ok(totals.slashes > 0, "never slashed");
    assert.ok(totals.releases > 0, "never released a claim");
    assert.ok(totals.rejectedUnbondsWithClaims > 0, "never tried to unbond with a live claim");
    assert.ok(totals.cancels > 0 && totals.claims > totals.fills / 2, "too few cancels/claims");
    assert.ok(totals.closedClaimAttempts > 0, "never tried to claim while closed");
  });
});
