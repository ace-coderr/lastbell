# Keeper

A Cloudflare Worker ([`keeper/`](../keeper)) with a Cron Trigger every minute. It needs no local machine or server.

## Each run

1. **Snapshot.** One pass over the contract: the block, every market's `gate()`, all open orders, and the keeper's bond, live claims and capacity.
2. **Plan.** A pure function ([`engine.ts`](../keeper/src/engine.ts) `plan`, unit-tested):
   - finish its own live claims first (only if the gate is fresh);
   - claim triggered orders on a fresh gate, highest fee first, never beyond `bond / slashAmount`;
   - take over claims another keeper let lapse (the contract slashes that keeper);
   - refund up to 2 expired orders to their owners;
   - at most 5 transactions per run;
   - everything else is counted by reason: `market-closed`, `not-triggered`, `oracle-paused`, …
3. **Check before claiming.** The keeper quotes the real Uniswap QuoterV2 and compares the result with the contract's own `minAmountOut`. If the pool can't deliver, it doesn't claim, so it never puts its bond at risk on an unfillable order.
4. **Execute.** For each action: simulate, send, and wait for the receipt. `claim` then `fill`, back to back.

The contract re-checks everything, so a buggy or malicious keeper can only fail to act. It can't fill on a stale price or below min-out.

## `GET /status`

Public JSON, cached at the edge for 5 s:
- the market clock and per-market gate (status, oracle price, pool price);
- contract totals: fills, $WIF burned from fees, $WIF paid to keepers, $WIF slashed, bonded and prepaid;
- open orders by state (`armed`, `queued:<reason>`, `executing`, `expired`);
- the keeper's bond and claims;
- `lastRun` / `lastAction`.

Before deployment it reports `configured: false` and falls back to reading the Chainlink feeds directly.

KV holds the run log. Runs that did nothing are written once every 10 minutes, so even every-minute cron stays within the free tier's 1,000 writes per day.

## Configuration

| Name | Kind | Value |
|---|---|---|
| `RPC_URL` | var | `https://rpc.mainnet.chain.robinhood.com` |
| `LASTBELL_ADDRESS` | var | set after the mainnet deploy (task 8) |
| `QUOTER_ADDRESS` | var (optional) | defaults to Uniswap QuoterV2 `0x33e8…A9E7` |
| `KEEPER_PRIVATE_KEY` | **secret** | set by the owner with `wrangler secret put KEEPER_PRIVATE_KEY`; never in git |
| `STATE` | KV binding | provisioned by wrangler on first deploy |

## Tested

- `keeper/test/plan.test.ts`: planning rules.
- `contracts/test/keeper.e2e.test.ts`: the real engine against the real contracts on Hardhat. It covers:
  - claim + fill when the price crosses;
  - weekend orders stay queued and execute after Monday's first round;
  - no claim when the pool can't meet min-out;
  - expired orders are refunded;
  - an abandoned claim is taken over, with the idle keeper slashed.
- Ran locally under `wrangler dev`, including the scheduled handler and KV. `wrangler deploy --dry-run` bundles to 183 KB gzipped.

## Known limits

- **Overlapping runs.** Two cron runs could overlap if one is slow (over a minute). The second would hit `AlreadyClaimed` or `NotOpen` and stop harmlessly. Nonces come from the chain's pending count.
- **One keeper key.** Anyone can run another keeper by bonding $WIF; the contract doesn't care who fills.
