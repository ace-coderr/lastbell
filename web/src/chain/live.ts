import { MARKETS, MARKET_LIST, USDG, gateStatusOf, lastbellAbi, type MarketSymbol } from "@lastbell/shared";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, zeroAddress, type Address, type Hash, type PublicClient } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { DEPLOY_BLOCK, KEEPER_URL, LASTBELL } from "../config.js";
import type { FlywheelStats, KeeperRow, UiMarket, UiOrder } from "../model.js";

const POLL = 15_000;
const lb = { address: LASTBELL ?? zeroAddress, abi: lastbellAbi } as const;
const FALLBACK_ORDER: MarketSymbol[] = ["SPY", "NVDA", "AAPL"];

export interface MarketChain {
  token: Address;
  stockDecimals: number;
}

/** Symbol for an on-chain market: by token address, or by position (local test deployments use mock tokens). */
function symbolFor(token: Address, index: number): MarketSymbol {
  return MARKET_LIST.find((m) => m.token.toLowerCase() === token.toLowerCase())?.symbol ?? FALLBACK_ORDER[index] ?? "SPY";
}

/** The deployed contract's minimum keeper fee, in WIF (undefined until it loads). */
export function useMinFee(): number | undefined {
  const { data } = useReadContract({ ...lb, functionName: "minFee", query: { enabled: !!LASTBELL } });
  return data === undefined ? undefined : Number(formatUnits(data, 18));
}

export function useLiveMarkets() {
  const { data: count } = useReadContract({ ...lb, functionName: "marketCount", query: { enabled: !!LASTBELL } });
  const ids = Array.from({ length: Number(count ?? 0) }, (_, i) => i);
  const reads = useReadContracts({
    contracts: ids.flatMap((id) => [
      { ...lb, functionName: "market", args: [id] } as const,
      { ...lb, functionName: "gate", args: [id] } as const,
    ]),
    query: { enabled: ids.length > 0, refetchInterval: POLL },
  });

  const markets: UiMarket[] = [];
  const chain: MarketChain[] = [];
  ids.forEach((id) => {
    const m = reads.data?.[id * 2]?.result as { token: Address; stockUnit: bigint; feedUnit: bigint } | undefined;
    const g = reads.data?.[id * 2 + 1]?.result as { status: number; price: bigint; updatedAt: bigint; poolPrice: bigint } | undefined;
    if (!m || !g) return;
    const symbol = symbolFor(m.token, id);
    const feedDecimals = String(m.feedUnit).length - 1;
    markets.push({
      id,
      symbol,
      name: MARKETS[symbol].name,
      price: Number(formatUnits(g.price, feedDecimals)),
      poolPrice: Number(formatUnits(g.poolPrice, feedDecimals)),
      updatedAt: Number(g.updatedAt),
      gate: gateStatusOf(g.status),
    });
    chain.push({ token: m.token, stockDecimals: String(m.stockUnit).length - 1 });
  });
  return { markets, chain, loading: reads.isLoading, error: reads.error, refetch: reads.refetch };
}

interface ChainOrder {
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

export function toUiOrder(id: bigint, o: ChainOrder, markets: UiMarket[], chain: MarketChain[]): UiOrder {
  const stockDecimals = chain[o.market]?.stockDecimals ?? 18;
  const stop = o.kind === 0;
  return {
    id: id.toString(),
    market: markets[o.market]?.symbol ?? FALLBACK_ORDER[o.market] ?? "SPY",
    kind: stop ? "stop" : "limit",
    amountIn: Number(formatUnits(o.amountIn, stop ? stockDecimals : USDG.decimals)),
    trigger: Number(formatUnits(o.triggerPrice, 8)),
    slippageBps: o.slippageBps,
    expiry: Number(o.expiry),
    feeWif: Number(formatUnits(o.fee, 18)),
    status: o.status === 2 ? "filled" : o.status === 3 ? "cancelled" : "open",
    claimer: o.claimer,
    claimDeadline: Number(o.claimDeadline),
    amountOut: o.status === 2 ? Number(formatUnits(o.amountOut, stop ? USDG.decimals : stockDecimals)) : undefined,
  };
}

export function useLiveOrders(owner: Address | undefined, markets: UiMarket[], chain: MarketChain[]) {
  const ids = useReadContract({
    ...lb,
    functionName: "ordersOf",
    args: [owner ?? zeroAddress],
    query: { enabled: !!LASTBELL && !!owner, refetchInterval: POLL },
  });
  const list = [...(ids.data ?? [])].reverse();
  const reads = useReadContracts({
    contracts: list.map((id) => ({ ...lb, functionName: "getOrder", args: [id] }) as const),
    query: { enabled: list.length > 0, refetchInterval: POLL },
  });
  const client = usePublicClient();
  const filledIds = list.filter((id, i) => (reads.data?.[i]?.result as ChainOrder | undefined)?.status === 2);
  const fills = useQuery({
    queryKey: ["fills", ...filledIds.map(String)],
    queryFn: () => fillTxs(client!, filledIds),
    enabled: !!client && filledIds.length > 0,
    staleTime: Infinity,
  });

  const orders = list.flatMap((id, i) => {
    const o = reads.data?.[i]?.result as ChainOrder | undefined;
    if (!o) return [];
    const ui = toUiOrder(id, o, markets, chain);
    return [{ ...ui, fillTx: fills.data?.[ui.id] }];
  });
  return {
    orders,
    loading: ids.isLoading || reads.isLoading,
    refetch: async () => {
      await ids.refetch();
      await reads.refetch();
    },
  };
}

/** Fill transaction per order id, from OrderFilled events (the RPC allows 10M-block windows per query). */
async function fillTxs(client: PublicClient, ids: bigint[]): Promise<Record<string, Hash>> {
  const latest = await client.getBlockNumber();
  const out: Record<string, Hash> = {};
  const WINDOW = 9_999_999n;
  for (const id of ids) {
    for (let to = latest; to >= DEPLOY_BLOCK && !out[id.toString()]; to -= WINDOW + 1n) {
      const from = to - WINDOW > DEPLOY_BLOCK ? to - WINDOW : DEPLOY_BLOCK;
      const logs = await client.getContractEvents({ ...lb, eventName: "OrderFilled", args: { id }, fromBlock: from, toBlock: to });
      if (logs[0]?.transactionHash) out[id.toString()] = logs[0].transactionHash;
      if (from === DEPLOY_BLOCK) break;
    }
  }
  return out;
}

interface KeeperStatus {
  keeper?: { address: Address; bondWif: string; activeClaims: number; capacity: number } | null;
  lastRun?: { at: string; ok: boolean; open?: number; results?: { kind: string; ok: boolean }[]; skipped?: Record<string, number>; error?: string; missing?: string[] } | null;
}

export function useLiveFlywheel(): FlywheelStats | undefined {
  const totals = useReadContracts({
    contracts: (["totalFeesBurned", "totalSlashed", "totalKeeperPaid", "totalBonded", "totalFeeHeld", "totalFills", "orderCount"] as const).map(
      (functionName) => ({ ...lb, functionName }) as const,
    ),
    query: { enabled: !!LASTBELL, refetchInterval: POLL },
  });
  const status = useQuery({
    queryKey: ["keeper-status"],
    queryFn: async (): Promise<KeeperStatus> => (await fetch(`${KEEPER_URL}/status`)).json(),
    enabled: !!KEEPER_URL,
    refetchInterval: 20_000,
  });
  const keeperAddr = status.data?.keeper?.address;
  const keeperRead = useReadContract({ ...lb, functionName: "keepers", args: [keeperAddr ?? zeroAddress], query: { enabled: !!keeperAddr && !!LASTBELL } });

  const t = totals.data?.map((r) => r.result as bigint | undefined);
  if (!t || t.some((v) => v === undefined)) return undefined;
  const w = (v: bigint | undefined) => Number(formatUnits(v ?? 0n, 18));
  const keepers: KeeperRow[] = [];
  const k = status.data?.keeper;
  if (k) {
    keepers.push({
      address: k.address,
      bondWif: Number(k.bondWif),
      capacity: k.capacity,
      activeClaims: k.activeClaims,
      fills: Number(keeperRead.data?.[2] ?? 0),
      slashes: Number(keeperRead.data?.[3] ?? 0),
    });
  }
  const run = status.data?.lastRun;
  return {
    burnedFromFees: w(t[0]),
    slashedBurned: w(t[1]),
    paidToKeepers: w(t[2]),
    bonded: w(t[3]),
    prepaid: w(t[4]),
    fills: Number(t[5]),
    orders: Number(t[6]),
    keepers,
    lastRun: run ? { at: run.at, ok: run.ok, summary: summarize(run) } : undefined,
  };
}

function summarize(run: NonNullable<KeeperStatus["lastRun"]>): string {
  if (run.missing) return `keeper not configured yet (${run.missing.join(", ")})`;
  if (run.error) return run.error;
  const acted = run.results?.filter((r) => r.ok).length ?? 0;
  const skipped = Object.entries(run.skipped ?? {})
    .map(([k, v]) => `${v} ${k.replaceAll("-", " ")}`)
    .join(" · ");
  return `${run.open ?? 0} open · ${acted ? `${acted} executed` : "no action needed"}${skipped ? ` · ${skipped}` : ""}`;
}
