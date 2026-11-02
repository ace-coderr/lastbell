import { GATE_STATUS, orderState, type GateStatus, type MarketSymbol, type OrderState } from "@lastbell/shared";

/** What the screens render. Filled from the chain (live) or from demo.ts (demo mode). */
export interface UiMarket {
  id: number;
  symbol: MarketSymbol;
  name: string;
  price: number; // oracle, USD
  poolPrice: number; // Uniswap spot, USD
  updatedAt: number; // unix seconds
  gate: GateStatus;
}

export type OrderKind = "stop" | "limit";

export interface UiOrder {
  id: string;
  market: MarketSymbol;
  kind: OrderKind;
  amountIn: number; // stock for a stop, USDG for a limit buy
  trigger: number;
  slippageBps: number;
  expiry: number;
  feeWif: number;
  status: "open" | "filled" | "cancelled";
  claimer?: string;
  claimDeadline?: number;
  amountOut?: number; // USDG for a stop, stock for a limit buy, once filled
  fillTx?: string;
  placeTx?: string;
}

export interface KeeperRow {
  address: string;
  bondWif: number;
  capacity: number;
  activeClaims: number;
  fills: number;
  slashes: number;
}

export interface FlywheelStats {
  burnedFromFees: number;
  slashedBurned: number;
  paidToKeepers: number;
  bonded: number;
  prepaid: number;
  fills: number;
  orders: number;
  keepers: KeeperRow[];
  lastRun?: { at: string; ok: boolean; summary: string };
}

const ZERO = "0x0000000000000000000000000000000000000000";
const e8 = (n: number) => BigInt(Math.round(n * 1e8));

/** Same rules the keeper and contract use (shared/orderState), applied to UI numbers. */
export function stateOf(o: UiOrder, m: UiMarket | undefined, now: number): OrderState {
  const gateIndex = GATE_STATUS.indexOf(m?.gate ?? "bad-answer");
  return orderState(
    {
      status: o.status === "open" ? 1 : o.status === "filled" ? 2 : 3,
      claimer: o.claimer ?? ZERO,
      claimDeadline: BigInt(o.claimDeadline ?? 0),
      expiry: BigInt(o.expiry),
      triggerPrice: e8(o.trigger),
    },
    { status: gateIndex, price: e8(m?.price ?? 0) },
    now,
  );
}
