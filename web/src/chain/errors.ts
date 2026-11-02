import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError } from "viem";

/** Contract custom errors → what a person should read. */
const REVERTS: Record<string, string> = {
  BadOrder: "The contract rejected the order: check the amount, trigger, slippage (max 3%) and expiry.",
  ZeroAmount: "Enter an amount greater than zero.",
  InsufficientFees: "Not enough $WIF for the keeper fee.",
  UnknownMarket: "That market isn't available.",
  NotOpen: "This order is no longer open. It may have just filled or been cancelled.",
  NotOwner: "Only the order's owner can cancel it before it expires.",
  IsPaused: "The token issuer has paused transfers of this Stock Token. Try again once they resume.",
  Blocked: "This address is blocked by the Stock Token issuer.",
  ERC20InsufficientBalance: "Your balance is too low for this order.",
  ERC20InsufficientAllowance: "The token approval didn't go through. Try again.",
  GateClosed: "The price gate is closed right now.",
};

export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError) || /user rejected|denied/i.test(err.shortMessage)) {
      return "You rejected the request in your wallet.";
    }
    if (err.walk((e) => e instanceof InsufficientFundsError)) return "Not enough ETH on Robinhood Chain to pay for gas.";
    if (/chain mismatch|does not match the target chain/i.test(err.message)) return "Your wallet is on another network. Switch to Robinhood Chain.";
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && REVERTS[name]) return REVERTS[name];
      return `Transaction would fail: ${name ?? revert.reason ?? "reverted"}.`;
    }
    return err.shortMessage;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
