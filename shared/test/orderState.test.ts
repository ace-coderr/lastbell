import { describe, expect, it } from "vitest";
import { orderState, type OrderLike } from "../src/orderState.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const KEEPER = "0x00000000000000000000000000000000000000aa";
const order = (over: Partial<OrderLike> = {}): OrderLike => ({
  status: 1,
  claimer: ZERO,
  claimDeadline: 0n,
  expiry: 2_000n,
  triggerPrice: 74_000_000_000n,
  ...over,
});
const FRESH = (price: bigint) => ({ status: 0, price });

describe("orderState", () => {
  it("is armed while the price sits above the trigger on a fresh gate", () => {
    expect(orderState(order(), FRESH(75_000_000_000n), 1_000)).toEqual({ kind: "armed" });
  });

  it("is queued with the gate's reason when the gate isn't fresh", () => {
    expect(orderState(order(), { status: 1, price: 1n }, 1_000)).toEqual({ kind: "queued", reason: "market-closed" });
    expect(orderState(order(), { status: 7, price: 1n }, 1_000)).toEqual({ kind: "queued", reason: "pool-out-of-band" });
  });

  it("is executing once triggered, and while a keeper holds a live claim", () => {
    expect(orderState(order(), FRESH(73_000_000_000n), 1_000)).toEqual({ kind: "executing", claimed: false });
    const claimed = order({ claimer: KEEPER, claimDeadline: 1_100n });
    expect(orderState(claimed, { status: 1, price: 1n }, 1_000)).toEqual({ kind: "executing", claimed: true });
    // claim ran out and the market closed: back to queued
    expect(orderState(claimed, { status: 1, price: 1n }, 1_200)).toEqual({ kind: "queued", reason: "market-closed" });
  });

  it("reports terminal and expired states first", () => {
    expect(orderState(order({ status: 2 }), FRESH(1n), 1_000)).toEqual({ kind: "filled" });
    expect(orderState(order({ status: 3 }), FRESH(1n), 1_000)).toEqual({ kind: "cancelled" });
    expect(orderState(order(), FRESH(1n), 2_001)).toEqual({ kind: "expired" });
  });
});
