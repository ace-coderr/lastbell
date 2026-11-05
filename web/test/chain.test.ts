import { lastbellAbi } from "@lastbell/shared";
import { ContractFunctionRevertedError, UserRejectedRequestError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { toPlaceArgs } from "../src/chain/actions.js";
import { friendlyError, isRejection } from "../src/chain/errors.js";
import { stateOf, type UiMarket, type UiOrder } from "../src/model.js";
import type { OrderDraft } from "../src/screens/Trade.js";

const market: UiMarket = { id: 1, symbol: "NVDA", name: "NVIDIA", price: 207.65, poolPrice: 207.4, updatedAt: 0, gate: "fresh" };
const draft = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  market,
  kind: "stop",
  amountIn: 2.5,
  trigger: 198.1,
  slippageBps: 100,
  expiryDays: 7,
  feeWif: 50,
  ...over,
});

describe("toPlaceArgs", () => {
  it("scales every number with its own decimals", () => {
    const a = toPlaceArgs(draft(), 18, 1_800_000_000);
    expect(a).toEqual({
      marketId: 1,
      kind: 0,
      amountIn: 2_500_000_000_000_000_000n,
      trigger: 19_810_000_000n,
      slippageBps: 100,
      expiry: 1_800_000_000n + 7n * 86400n,
      fee: 50n * 10n ** 18n,
    });
  });

  it("uses USDG's 6 decimals for a limit buy and avoids float noise", () => {
    const a = toPlaceArgs(draft({ kind: "limit", amountIn: 0.1 + 0.2, trigger: 0.1 + 0.2 }), 18, 0);
    expect(a.kind).toBe(1);
    expect(a.amountIn).toBe(300_000n);
    expect(a.trigger).toBe(30_000_000n);
  });
});

describe("friendlyError", () => {
  it("explains a wallet rejection", () => {
    expect(friendlyError(new UserRejectedRequestError(new Error("User rejected the request.")))).toBe("You rejected the request in your wallet. Nothing was spent and no order was placed.");
  });

  it("treats a rejection as a calm notice, not a failure", () => {
    expect(isRejection(friendlyError(new UserRejectedRequestError(new Error("x"))))).toBe(true);
    expect(isRejection("Not enough ETH on Robinhood Chain to pay for gas.")).toBe(false);
  });

  it("translates contract errors into plain words", () => {
    const revert = (errorName: "BadOrder" | "NotOpen") =>
      new ContractFunctionRevertedError({ abi: lastbellAbi, functionName: "placeOrder", data: encodeErrorResult({ abi: lastbellAbi, errorName }) });
    expect(friendlyError(revert("BadOrder"))).toMatch(/check the amount, trigger/);
    expect(friendlyError(revert("NotOpen"))).toMatch(/no longer open/);
  });

  it("passes our own messages through", () => {
    expect(friendlyError(new Error("You have 98 SPY, not enough for this order."))).toBe("You have 98 SPY, not enough for this order.");
  });
});

describe("stateOf", () => {
  const order: UiOrder = { id: "1", market: "NVDA", kind: "stop", amountIn: 1, trigger: 200, slippageBps: 100, expiry: 2_000, feeWif: 50, status: "open" };
  it("is armed above the trigger and executing at or below it", () => {
    expect(stateOf(order, market, 1_000).kind).toBe("armed");
    expect(stateOf(order, { ...market, price: 199.99 }, 1_000).kind).toBe("executing");
  });
  it("is queued until open when the market is closed", () => {
    expect(stateOf(order, { ...market, gate: "market-closed" }, 1_000)).toEqual({ kind: "queued", reason: "market-closed" });
  });
});
