import { gateStatusOf, lastbellAbi, quoterV2Abi, type GateStatus } from "@lastbell/shared";
import { PAGE, scanPlan } from "./scan.js";
import {
  BaseError,
  ContractFunctionRevertedError,
  zeroAddress,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

// ---------------------------------------------------------------- snapshot

export interface EngineConfig {
  lastbell: Address;
  /** Uniswap QuoterV2. When set, the keeper only claims orders the pool can fill at min-out. */
  quoter?: Address;
  /** Most transactions one run may send (each claim+fill counts once). */
  maxActions?: number;
  /** Most expired orders refunded per run. */
  maxRefunds?: number;
}

export interface MarketSnap {
  id: number;
  market: {
    token: Address;
    feed: Address;
    pool: Address;
    poolFee: number;
    stockIsToken0: boolean;
    heartbeat: number;
    maxDeviationBps: number;
    stockUnit: bigint;
    feedUnit: bigint;
  };
  gate: { status: number; price: bigint; updatedAt: bigint; poolPrice: bigint };
}

export interface OrderSnap {
  id: bigint;
  owner: Address;
  expiry: bigint;
  market: number;
  kind: number;
  status: number;
  claimer: Address;
  claimDeadline: bigint;
  slippageBps: number;
  amountIn: bigint;
  triggerPrice: bigint;
  fee: bigint;
  amountOut: bigint;
}

export interface Snapshot {
  now: number;
  block: bigint;
  quote: Address;
  claimWindow: number;
  keeper: { address: Address; bond: bigint; activeClaims: number; capacity: bigint; active: boolean };
  markets: MarketSnap[];
  open: OrderSnap[];
  /** False when there were more orders than one run reads; the rest are covered by later runs. */
  scanComplete: boolean;
}

const OPEN = 1;

export async function readSnapshot(client: PublicClient, cfg: EngineConfig, keeper: Address, round = 0): Promise<Snapshot> {
  const c = { address: cfg.lastbell, abi: lastbellAbi } as const;
  const [block, count, marketCount, claimWindow, quote, k, capacity, active] = await Promise.all([
    client.getBlock(),
    client.readContract({ ...c, functionName: "orderCount" }),
    client.readContract({ ...c, functionName: "marketCount" }),
    client.readContract({ ...c, functionName: "claimWindow" }),
    client.readContract({ ...c, functionName: "quote" }),
    client.readContract({ ...c, functionName: "keepers", args: [keeper] }),
    client.readContract({ ...c, functionName: "claimCapacity", args: [keeper] }),
    client.readContract({ ...c, functionName: "isActiveKeeper", args: [keeper] }),
  ]);

  const markets = await Promise.all(
    Array.from({ length: Number(marketCount) }, async (_, id) => {
      const [market, gate] = await Promise.all([
        client.readContract({ ...c, functionName: "market", args: [id] }),
        client.readContract({ ...c, functionName: "gate", args: [id] }),
      ]);
      return { id, market, gate } as MarketSnap;
    }),
  );

  const open: OrderSnap[] = [];
  const scan = scanPlan(count, round);
  const pages = await Promise.all(scan.starts.map((from) => client.readContract({ ...c, functionName: "getOrders", args: [from, PAGE] })));
  pages.forEach((page, p) => {
    const from = scan.starts[p]!;
    page.forEach((o, i) => {
      if (o.status === OPEN) open.push({ id: from + BigInt(i), ...o } as OrderSnap);
    });
  });

  return {
    now: Number(block.timestamp),
    block: block.number,
    quote,
    claimWindow: Number(claimWindow),
    keeper: { address: keeper, bond: k[0], activeClaims: Number(k[1]), capacity, active },
    markets,
    open,
    scanComplete: scan.complete,
  };
}

// ---------------------------------------------------------------- plan (pure)

export type ActionKind = "fill" | "claim-fill" | "refund-expired";
export interface Action {
  kind: ActionKind;
  order: OrderSnap;
}
export type SkipReason = GateStatus | "not-triggered" | "expiring" | "claimed-by-other" | "keeper-not-bonded" | "at-capacity";

export interface Plan {
  actions: Action[];
  skipped: Partial<Record<SkipReason, number>>;
}

/** Margin so a claim mined a few seconds after the snapshot still fits before expiry. */
const EXPIRY_MARGIN = 15;

export function plan(s: Snapshot, cfg: Pick<EngineConfig, "maxActions" | "maxRefunds"> = {}): Plan {
  const me = s.keeper.address.toLowerCase();
  const skipped: Plan["skipped"] = {};
  const skip = (r: SkipReason) => (skipped[r] = (skipped[r] ?? 0) + 1);
  const fills: Action[] = [];
  const claims: Action[] = [];
  const refunds: Action[] = [];

  for (const o of s.open) {
    const claimed = o.claimer !== zeroAddress;
    const claimLive = claimed && BigInt(s.now) <= o.claimDeadline;
    const gate = s.markets[o.market]?.gate;
    const gateStatus = gateStatusOf(gate?.status ?? 4);

    if (claimLive && o.claimer.toLowerCase() === me) {
      if (gateStatus === "fresh") fills.push({ kind: "fill", order: o });
      else skip(gateStatus);
      continue;
    }
    if (BigInt(s.now) > o.expiry) {
      if (!claimLive) refunds.push({ kind: "refund-expired", order: o });
      continue;
    }
    if (gateStatus !== "fresh") skip(gateStatus);
    else if (gate!.price > o.triggerPrice) skip("not-triggered");
    else if (BigInt(s.now + s.claimWindow + EXPIRY_MARGIN) > o.expiry) skip("expiring");
    else if (claimLive) skip("claimed-by-other");
    else if (!s.keeper.active) skip("keeper-not-bonded");
    else claims.push({ kind: "claim-fill", order: o });
  }

  // Best-paying orders first; never exceed what the bond can back.
  claims.sort((a, b) => (b.order.fee > a.order.fee ? 1 : b.order.fee < a.order.fee ? -1 : 0));
  const room = Math.max(0, Number(s.keeper.capacity) - s.keeper.activeClaims);
  for (let i = room; i < claims.length; i++) skip("at-capacity");

  const maxActions = cfg.maxActions ?? 5;
  const actions = [...fills, ...claims.slice(0, room), ...refunds.slice(0, cfg.maxRefunds ?? 2)].slice(0, maxActions);
  return { actions, skipped };
}

// ---------------------------------------------------------------- execute

export interface ActionResult {
  kind: ActionKind;
  orderId: string;
  ok: boolean;
  txs: Hash[];
  note?: string;
}

export interface RunReport {
  at: string;
  block: string;
  keeper: Address;
  open: number;
  /** False when the order list is longer than one run reads (see scan.ts). */
  scanComplete: boolean;
  results: ActionResult[];
  skipped: Plan["skipped"];
  durationMs: number;
}

type Wallet = WalletClient<Transport, Chain, Account>;

export function errorText(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason ?? "reverted";
      const args = revert.data?.args?.length ? `(${revert.data.args.join(",")})` : "";
      return name + args;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message.slice(0, 160) : String(err);
}

async function send(
  publicClient: PublicClient,
  wallet: Wallet,
  cfg: EngineConfig,
  functionName: "claim" | "fill" | "cancel" | "release",
  id: bigint,
): Promise<Hash> {
  const { request } = await publicClient.simulateContract({
    account: wallet.account,
    address: cfg.lastbell,
    abi: lastbellAbi,
    functionName,
    args: [id],
  });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 45_000 });
  if (receipt.status !== "success") throw new Error(`${functionName} ${hash} reverted`);
  return hash;
}

/**
 * True when the pool would currently deliver at least the contract's min-out for this order.
 * A min-out of zero can never be filled (the contract rejects it), so it is never worth a claim.
 */
async function poolCanFill(publicClient: PublicClient, cfg: EngineConfig, s: Snapshot, o: OrderSnap): Promise<boolean> {
  if (!cfg.quoter) return true;
  const m = s.markets[o.market]!;
  const { id: _id, ...order } = o;
  const minOut = await publicClient.readContract({
    address: cfg.lastbell,
    abi: lastbellAbi,
    functionName: "minAmountOut",
    args: [order, m.market, m.gate.price],
  });
  if (minOut === 0n) return false;
  const stockIn = o.kind === 0;
  try {
    const { result } = await publicClient.simulateContract({
      address: cfg.quoter,
      abi: quoterV2Abi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: stockIn ? m.market.token : s.quote,
          tokenOut: stockIn ? s.quote : m.market.token,
          amountIn: o.amountIn,
          fee: m.market.poolFee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    return result[0] >= minOut;
  } catch {
    return false; // the quoter reverts when the pool cannot swap this amount at all
  }
}

export async function runOnce(publicClient: PublicClient, wallet: Wallet, cfg: EngineConfig, round = 0): Promise<RunReport> {
  const started = Date.now();
  const s = await readSnapshot(publicClient, cfg, wallet.account.address, round);
  const p = plan(s, cfg);
  const results: ActionResult[] = [];

  for (const a of p.actions) {
    const r: ActionResult = { kind: a.kind, orderId: a.order.id.toString(), ok: false, txs: [] };
    let holdsClaim = a.kind === "fill";
    try {
      if (a.kind === "refund-expired") {
        r.txs.push(await send(publicClient, wallet, cfg, "cancel", a.order.id));
      } else {
        if (a.kind === "claim-fill") {
          if (!(await poolCanFill(publicClient, cfg, s, a.order))) {
            r.note = "pool can't meet min-out right now; not claiming";
            results.push(r);
            continue;
          }
          r.txs.push(await send(publicClient, wallet, cfg, "claim", a.order.id));
          holdsClaim = true;
        }
        r.txs.push(await send(publicClient, wallet, cfg, "fill", a.order.id));
        holdsClaim = false;
      }
      r.ok = true;
    } catch (err) {
      r.note = errorText(err);
      // A claim we cannot fill is released for free while its window is open, never left to lapse into a slash.
      if (holdsClaim) {
        try {
          r.txs.push(await send(publicClient, wallet, cfg, "release", a.order.id));
          r.note += " (claim released, no slash)";
        } catch (releaseErr) {
          r.note += ` (release failed: ${errorText(releaseErr)})`;
        }
      }
    }
    results.push(r);
  }

  return {
    at: new Date(started).toISOString(),
    block: s.block.toString(),
    keeper: s.keeper.address,
    open: s.open.length,
    scanComplete: s.scanComplete,
    results,
    skipped: p.skipped,
    durationMs: Date.now() - started,
  };
}
