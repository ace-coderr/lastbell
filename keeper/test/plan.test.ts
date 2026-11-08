import { zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { plan, type MarketSnap, type OrderSnap, type Snapshot } from "../src/engine.js";

const ME = "0x00000000000000000000000000000000000000aa" as Address;
const OTHER = "0x00000000000000000000000000000000000000bb" as Address;
const NOW = 1_800_000_000;

const market = (status = 0, price = 73_500_000_000n): MarketSnap => ({
  id: 0,
  market: {
    token: "0x0000000000000000000000000000000000000001",
    feed: "0x0000000000000000000000000000000000000002",
    pool: "0x0000000000000000000000000000000000000003",
    poolFee: 500,
    stockIsToken0: true,
    heartbeat: 86400,
    maxDeviationBps: 150,
    stockUnit: 10n ** 18n,
    feedUnit: 10n ** 8n,
  },
  gate: { status, price, updatedAt: BigInt(NOW - 60), poolPrice: price },
});

let nextId = 0n;
const order = (over: Partial<OrderSnap> = {}): OrderSnap => ({
  id: nextId++,
  owner: "0x00000000000000000000000000000000000000cc",
  expiry: BigInt(NOW + 86400),
  market: 0,
  kind: 0,
  status: 1,
  claimer: zeroAddress,
  claimDeadline: 0n,
  slippageBps: 100,
  amountIn: 10n ** 18n,
  triggerPrice: 74_000_000_000n,
  fee: 50n * 10n ** 18n,
  amountOut: 0n,
  ...over,
});

const snap = (open: OrderSnap[], over: Partial<Snapshot> = {}): Snapshot => ({
  now: NOW,
  block: 1n,
  quote: "0x0000000000000000000000000000000000000004",
  claimWindow: 120,
  keeper: { address: ME, bond: 10n ** 23n, activeClaims: 0, capacity: 10n, active: true },
  markets: [market()],
  open,
  scanComplete: true,
  ...over,
});

describe("plan", () => {
  it("claims triggered orders on a fresh gate, best fee first", () => {
    const cheap = order({ fee: 50n });
    const rich = order({ fee: 500n });
    const p = plan(snap([cheap, rich]));
    expect(p.actions.map((a) => [a.kind, a.order.fee])).toEqual([
      ["claim-fill", 500n],
      ["claim-fill", 50n],
    ]);
  });

  it("does nothing but count when the market is closed", () => {
    const p = plan(snap([order(), order()], { markets: [market(1)] }));
    expect(p.actions).toEqual([]);
    expect(p.skipped).toEqual({ "market-closed": 2 });
  });

  it("skips untriggered, expiring, and orders another keeper holds", () => {
    const p = plan(
      snap([
        order({ triggerPrice: 70_000_000_000n }),
        order({ expiry: BigInt(NOW + 100) }),
        order({ claimer: OTHER, claimDeadline: BigInt(NOW + 60) }),
      ]),
    );
    expect(p.actions).toEqual([]);
    expect(p.skipped).toEqual({ "not-triggered": 1, expiring: 1, "claimed-by-other": 1 });
  });

  it("takes over a claim that ran out (the contract slashes the idle keeper)", () => {
    const p = plan(snap([order({ claimer: OTHER, claimDeadline: BigInt(NOW - 1) })]));
    expect(p.actions.map((a) => a.kind)).toEqual(["claim-fill"]);
  });

  it("finishes its own live claims first, but not into a closed gate", () => {
    const mine = order({ claimer: ME, claimDeadline: BigInt(NOW + 60), fee: 1n });
    const fresh = order({ fee: 999n });
    expect(plan(snap([fresh, mine])).actions.map((a) => a.kind)).toEqual(["fill", "claim-fill"]);
    expect(plan(snap([mine], { markets: [market(2)] })).skipped).toEqual({ "oracle-paused": 1 });
  });

  it("never claims beyond bond capacity", () => {
    const p = plan(snap([order(), order(), order()], { keeper: { address: ME, bond: 0n, activeClaims: 3, capacity: 4n, active: true } }));
    expect(p.actions).toHaveLength(1);
    expect(p.skipped).toEqual({ "at-capacity": 2 });
  });

  it("doesn't claim at all without an active bond", () => {
    const p = plan(snap([order()], { keeper: { address: ME, bond: 0n, activeClaims: 0, capacity: 0n, active: false } }));
    expect(p.skipped).toEqual({ "keeper-not-bonded": 1 });
  });

  it("refunds a couple of expired orders per run, never ones with a live claim", () => {
    const expired = [1, 2, 3].map(() => order({ expiry: BigInt(NOW - 10) }));
    const held = order({ expiry: BigInt(NOW - 10), claimer: OTHER, claimDeadline: BigInt(NOW + 30) });
    const p = plan(snap([...expired, held]));
    expect(p.actions.map((a) => a.kind)).toEqual(["refund-expired", "refund-expired"]);
  });

  it("caps the actions per run", () => {
    const p = plan(snap(Array.from({ length: 9 }, () => order())), { maxActions: 3 });
    expect(p.actions).toHaveLength(3);
  });
});
