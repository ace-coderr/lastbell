import { MARKET_LIST, gateStatusOf, lastbellAbi, marketClock, orderState } from "@lastbell/shared";
import { formatUnits, zeroAddress, type Address, type PublicClient } from "viem";
import { readSnapshot } from "./engine.js";

/** Public status of a deployed Lastbell: gates, totals, the keeper's bond and where every open order stands. */
export async function readContractStatus(client: PublicClient, lastbell: Address, keeper: Address | undefined) {
  const s = await readSnapshot(client, { lastbell }, keeper ?? zeroAddress);
  const c = { address: lastbell, abi: lastbellAbi } as const;
  const [burned, paid, fills, bonded, slashed, feeHeld, orderCount] = await Promise.all([
    client.readContract({ ...c, functionName: "totalFeesBurned" }),
    client.readContract({ ...c, functionName: "totalKeeperPaid" }),
    client.readContract({ ...c, functionName: "totalFills" }),
    client.readContract({ ...c, functionName: "totalBonded" }),
    client.readContract({ ...c, functionName: "totalSlashed" }),
    client.readContract({ ...c, functionName: "totalFeeHeld" }),
    client.readContract({ ...c, functionName: "orderCount" }),
  ]);

  const states: Record<string, number> = {};
  for (const o of s.open) {
    const st = orderState(o, s.markets[o.market]!.gate, s.now);
    const key = st.kind === "queued" ? `queued:${st.reason}` : st.kind;
    states[key] = (states[key] ?? 0) + 1;
  }

  const wif = (v: bigint) => formatUnits(v, 18);
  return {
    configured: true,
    contract: lastbell,
    now: s.now,
    block: s.block.toString(),
    clock: marketClock(s.now),
    markets: s.markets.map((m) => ({
      id: m.id,
      symbol: MARKET_LIST.find((x) => x.token.toLowerCase() === m.market.token.toLowerCase())?.symbol ?? `market ${m.id}`,
      gate: gateStatusOf(m.gate.status),
      price: formatUnits(m.gate.price, 8),
      poolPrice: formatUnits(m.gate.poolPrice, 8),
      updatedAt: Number(m.gate.updatedAt),
    })),
    totals: {
      orders: Number(orderCount),
      fills: Number(fills),
      wifBurnedFromFees: wif(burned),
      wifPaidToKeepers: wif(paid),
      wifSlashedAndBurned: wif(slashed),
      wifBonded: wif(bonded),
      wifPrepaidFees: wif(feeHeld),
    },
    openOrders: { total: s.open.length, byState: states, scanComplete: s.scanComplete },
    keeper: keeper
      ? {
          address: keeper,
          bondWif: wif(s.keeper.bond),
          active: s.keeper.active,
          activeClaims: s.keeper.activeClaims,
          capacity: Number(s.keeper.capacity),
        }
      : null,
  };
}
