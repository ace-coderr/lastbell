import { gateStatusOf, type QueueReason } from "./freshness.js";

// One place that turns on-chain order + gate data into what a person sees.

export type OrderState =
  | { kind: "armed" } // watching: gate fresh, price above the trigger
  | { kind: "queued"; reason: QueueReason } // gate not fresh: "queued until market open" and friends
  | { kind: "executing"; claimed: boolean } // triggered: waiting for, or held by, a keeper
  | { kind: "filled" }
  | { kind: "cancelled" }
  | { kind: "expired" };

export interface OrderLike {
  status: number; // Lastbell.Status: 1 open, 2 filled, 3 cancelled
  claimer: string;
  claimDeadline: bigint;
  expiry: bigint;
  triggerPrice: bigint;
}

export interface GateLike {
  status: number; // Lastbell.Gate
  price: bigint;
}

const ZERO = "0x0000000000000000000000000000000000000000";

export function orderState(o: OrderLike, gate: GateLike, now: number): OrderState {
  if (o.status === 2) return { kind: "filled" };
  if (o.status === 3) return { kind: "cancelled" };
  const t = BigInt(now);
  if (t > o.expiry) return { kind: "expired" };
  if (o.claimer !== ZERO && t <= o.claimDeadline) return { kind: "executing", claimed: true };
  const g = gateStatusOf(gate.status);
  if (g !== "fresh") return { kind: "queued", reason: g };
  if (gate.price <= o.triggerPrice) return { kind: "executing", claimed: false };
  return { kind: "armed" };
}
