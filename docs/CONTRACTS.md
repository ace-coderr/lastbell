# Contracts

One contract, [`Lastbell.sol`](../contracts/contracts/Lastbell.sol), which inherits [`KeeperRegistry.sol`](../contracts/contracts/KeeperRegistry.sol). There is no owner, no proxy and no setter. Markets and parameters are fixed in the constructor. A new market means a new deployment.

## Order life cycle

```
placeOrder ──► Open ──claim (gate fresh, price ≤ trigger)──► Open + claimed ──fill──► Filled
   │             │                                              │
   │             └── cancel (owner any time; anyone after expiry) ◄┘ (claim cleared, no slash mid-window)
   │
   └── escrows stock (StopLoss) or USDG (LimitBuy) and reserves the $WIF fee
```

| Order type | Escrow | Fires when | Min-out on chain |
|---|---|---|---|
| **StopLoss** | stock | oracle price ≤ trigger | oracle value of the stock × (1 − slippage) |
| **LimitBuy** | USDG | oracle price ≤ limit | max(amount at the limit price, oracle amount × (1 − slippage)) |

The swap goes through the market's fixed Uniswap v3 pool via SwapRouter02, straight to the order owner. The contract checks the owner's balance change itself rather than trusting the router.

## The gate (`gate(marketId)`)

Checked at claim and again at fill. Order of checks:

1. `MarketClosed`: outside the 24/5 session, with US DST computed on chain and NYSE holidays for 2026–2027 in an immutable bitmap ([`MarketHours.sol`](../contracts/contracts/libraries/MarketHours.sol))
2. `OraclePaused`: `token.oraclePaused()` (issuer flag for corporate actions)
3. `TokenPaused`: `token.paused()`
4. `BadAnswer`: answer ≤ 0, `updatedAt` = 0 or in the future, or the feed call reverts
5. `NotUpdatedSinceOpen`: no round since the current open stretch began
6. `OlderThanHeartbeat`: age > heartbeat + grace
7. `PoolOutOfBand`: the pool's spot price differs from the feed by more than `maxDeviationBps`

## $WIF in the contract path

- **Keeper bond.** `bond()` locks $WIF and needs at least `minBond` to claim. Each live claim is backed by `slashAmount`, so a keeper can hold `bond / slashAmount` claims at once. `unbond()` reverts while any claim is live.
- **Prepaid fees.** `depositFees()` / `withdrawFees()`. `placeOrder` reserves the fee, taking it from the prepaid balance first and pulling any shortfall from the wallet.
- **Fill.** `fee / 2` is burned with `WIF.burn` and the rest goes to the keeper, so the parts always add up.
- **Slash.** If a claim's window ends while the gate is fresh (meaning the order could have been filled), the next `claim`, a `cancel` or `clearExpiredClaim` burns `slashAmount` of the keeper's bond. If the gate isn't fresh, the claim is released with no penalty.

## Parameters (fixed at deploy)

| | Test value | Planned mainnet value |
|---|---|---|
| `minFee` | 50 WIF | decided at deploy (task 8) |
| `minBond` | 100,000 WIF | decided at deploy |
| `slashAmount` | 10,000 WIF | decided at deploy |
| `claimWindow` | 120 s | 120 s |
| `graceSeconds` | 900 s | 900 s |
| `maxSlippageBps` | 300 | 300 |
| `maxDeviationBps` per market | 150 | 150 |

## Verified against

- Live mainnet, Monday 2 Nov 2026 after the 01:00 UTC (EST) open: all 36 equity feeds pushed a round at about 01:00:30, so the gate opens on a normal Monday.
- `MarketHours.sol` vs the IANA time zone database: 3,000 random instants plus every DST and holiday edge (`contracts/test/marketHours.test.ts`).
- Both pool orientations: on mainnet SPY's stock is `token0`, while NVDA and AAPL sit behind USDG. Both are covered in `contracts/test/lastbell.smoke.test.ts`.
