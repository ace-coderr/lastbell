import { USDG, lastbellAbi } from "@lastbell/shared";
import { useState } from "react";
import { erc20Abi, formatUnits, parseEventLogs, parseUnits, zeroAddress, type Address, type Hash } from "viem";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { readContract, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { LASTBELL } from "../config.js";
import type { OrderDraft } from "../screens/Trade.js";
import { friendlyError } from "./errors.js";
import type { MarketChain } from "./live.js";

const lb = { address: LASTBELL ?? zeroAddress, abi: lastbellAbi } as const;

export interface PlaceArgs {
  marketId: number;
  kind: 0 | 1;
  amountIn: bigint;
  trigger: bigint;
  slippageBps: number;
  expiry: bigint;
  fee: bigint;
}

/** Ticket numbers → contract arguments, with every decimal explicit. */
export function toPlaceArgs(d: OrderDraft, stockDecimals: number, now: number): PlaceArgs {
  const stop = d.kind === "stop";
  return {
    marketId: d.market.id,
    kind: stop ? 0 : 1,
    amountIn: parseUnits(trimTo(d.amountIn, stop ? stockDecimals : USDG.decimals), stop ? stockDecimals : USDG.decimals),
    trigger: parseUnits(trimTo(d.trigger, 8), 8),
    slippageBps: d.slippageBps,
    expiry: BigInt(now + Math.round(d.expiryDays * 86400)),
    fee: parseUnits(trimTo(d.feeWif, 18), 18),
  };
}

/** Number → decimal string with at most `decimals` places (no float noise like 0.1+0.2). */
function trimTo(n: number, decimals: number): string {
  const s = n.toFixed(Math.min(decimals, 12));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export interface Progress {
  index: number;
  total: number;
  label: string;
}

export function useLastbellActions(chain: MarketChain[]) {
  const config = useConfig();
  const { address } = useAccount();
  const { data: quote } = useReadContract({ ...lb, functionName: "quote", query: { enabled: !!LASTBELL } });
  const { data: wif } = useReadContract({ ...lb, functionName: "wif", query: { enabled: !!LASTBELL } });
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [orderErrors, setOrderErrors] = useState<Record<string, string>>({});

  async function confirm(hash: Hash): Promise<Hash> {
    const receipt = await waitForTransactionReceipt(config, { hash });
    if (receipt.status !== "success") throw new Error("The transaction reverted on chain.");
    return hash;
  }

  async function ensureAllowance(token: Address, amount: bigint, step: () => Progress) {
    if (amount === 0n || !address) return;
    const allowance = await readContract(config, { address: token, abi: erc20Abi, functionName: "allowance", args: [address, LASTBELL!] });
    if (allowance >= amount) return;
    setProgress(step());
    // Exact amount, never unlimited.
    await confirm(await writeContract(config, { address: token, abi: erc20Abi, functionName: "approve", args: [LASTBELL!, amount] }));
  }

  /** Approves exactly what's needed, then places the order. Returns the new order id. */
  async function place(d: OrderDraft, now: number): Promise<bigint | undefined> {
    if (!address || !LASTBELL || !quote || !wif) return;
    setError(null);
    try {
      const m = chain[d.market.id];
      if (!m) throw new Error("Market not loaded yet.");
      const args = toPlaceArgs(d, m.stockDecimals, now);
      const tokenIn = d.kind === "stop" ? m.token : quote;
      const [balIn, wifBal, feeBal, symbolIn] = await Promise.all([
        readContract(config, { address: tokenIn, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        readContract(config, { address: wif, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        readContract(config, { ...lb, functionName: "feeBalance", args: [address] }),
        Promise.resolve(d.kind === "stop" ? d.market.symbol : "USDG"),
      ]);
      if (balIn < args.amountIn) {
        throw new Error(`You have ${formatUnits(balIn, d.kind === "stop" ? m.stockDecimals : USDG.decimals)} ${symbolIn}, not enough for this order.`);
      }
      const shortfall = args.fee > feeBal ? args.fee - feeBal : 0n;
      if (wifBal < shortfall) throw new Error(`The fee needs ${formatUnits(shortfall, 18)} more WIF than you hold.`);

      const inAllowance = await readContract(config, { address: tokenIn, abi: erc20Abi, functionName: "allowance", args: [address, LASTBELL] });
      const wifAllowance = shortfall ? await readContract(config, { address: wif, abi: erc20Abi, functionName: "allowance", args: [address, LASTBELL] }) : 0n;
      const total = 1 + (inAllowance < args.amountIn ? 1 : 0) + (shortfall > wifAllowance ? 1 : 0);
      let index = 0;
      const next = (label: string) => () => ({ index: ++index, total, label });

      await ensureAllowance(tokenIn, args.amountIn, next(`Approve ${symbolIn}`));
      await ensureAllowance(wif, shortfall, next("Approve WIF fee"));

      setProgress(next(d.kind === "stop" ? "Place stop-loss" : "Place limit buy")());
      const { request } = await simulateContract(config, {
        ...lb,
        account: address,
        functionName: "placeOrder",
        args: [args.marketId, args.kind, args.amountIn, args.trigger, args.slippageBps, args.expiry, args.fee],
      });
      const hash = await writeContract(config, request);
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("The order transaction reverted.");
      const placed = parseEventLogs({ abi: lastbellAbi, logs: receipt.logs, eventName: "OrderPlaced" })[0];
      return placed?.args.id;
    } catch (err) {
      setError(friendlyError(err));
      return undefined;
    } finally {
      setProgress(null);
    }
  }

  /** Cancel (owner) or refund an expired order (anyone); funds always go to the owner. */
  async function cancel(id: string): Promise<boolean> {
    if (!address || !LASTBELL) return false;
    setPending((p) => ({ ...p, [id]: true }));
    setOrderErrors(({ [id]: _, ...rest }) => rest);
    try {
      const { request } = await simulateContract(config, { ...lb, account: address, functionName: "cancel", args: [BigInt(id)] });
      await confirm(await writeContract(config, request));
      return true;
    } catch (err) {
      setOrderErrors((e) => ({ ...e, [id]: friendlyError(err) }));
      return false;
    } finally {
      setPending((p) => ({ ...p, [id]: false }));
    }
  }

  return { place, cancel, progress, error, clearError: () => setError(null), pending, orderErrors, ready: !!quote && !!wif };
}
