# Contract audit

Scope: `Lastbell.sol`, `KeeperRegistry.sol`, `libraries/MarketHours.sol`, `libraries/PriceMath.sol`. Done before anyone else looks, by the authors, in 3 Nov 2026. It is a self-review backed by tests, not a third-party audit.

Method: read every line as an attacker; write each suspicion as a test; run it against the contract **as deployed at the time** to see whether it is real; fix; keep the test. Every finding below has a regression test in [`contracts/test/audit.test.ts`](../contracts/test/audit.test.ts) that **fails on the pre-audit code** (verified by swapping the old source back in: 8 failures) and passes on the fix. Areas where nothing was found have attack tests that pass on both.

## Findings

| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | **High** (keeper economics, not user funds) | **Keepers could be drained by unfillable orders.** A triggered order that can never fill still costs a claimer its slash: (a) a dust stop-loss whose minimum output rounds to **0** reverts `BadOrder` at fill, and the keeper's pre-claim quote check passed it (`0 ≥ 0`); (b) `slippageBps = 0` orders can never beat the pool fee; (c) a limit buy whose owner the issuer has blocked reverts in the token. The claim lapses and the keeper loses `slashAmount`. Cancelling refunds the fee, so an attacker paid only gas (about $0.002 on this chain) to burn a keeper's bond, order by order. Reproduced on the old contract: bond 100,000 → 90,000 in the test units, one order each. | `release(id)`: the claimer drops a **live** claim for free (only before the window ends, so a keeper that goes dark is still slashed). `placeOrder` rejects orders whose minimum output at their own trigger price is 0. The keeper never claims at min-out 0, treats a failed quote as "can't fill", and **releases** any claim whose fill simulation fails. |
| F2 | Medium (user funds, narrow trigger) | **`gate()` could revert**, and `cancel()` calls it when the order has a lapsed claim. If the issuer's `oraclePaused()` / `paused()` getter reverts (for example a token upgrade that removes them) or the pool's `slot0()` reverts, the owner **cannot cancel** that order, and the keeper snapshot and the UI break too. Reproduced. | Issuer flags and the pool read are `try/catch`: a failing read becomes a closed gate (`BadAnswer`, `PoolOutOfBand`). `gate()` never reverts, so cancel and refunds always work. |

Contract size after the fixes: 19,168 bytes (limit 24,576). No new privileges: there is still no owner, admin, pause or upgrade.

## Checked, nothing found (with attack tests)

| Area | What was tried | Result |
|---|---|---|
| **Reentrancy** | A hostile token whose transfer hook calls back into Lastbell as the order's owner, during `placeOrder`, the refund inside `cancel`, and the swap inside `fill`. Without a guard each re-entrant `cancel` would succeed. | Every call reverts with `ReentrancyGuardReentrantCall`; escrow and balances unchanged. All state-changing functions are `nonReentrant`, and effects precede interactions. |
| **Stale / paused feeds** | Weekend, mid-week holiday (Thanksgiving), no update since the open, older than heartbeat + grace, `oraclePaused`, token `paused`, zero / negative / future-dated / `int256.max` answers, reverting feed, pool out of band both ways. | Gate closes every time and never reverts. Checked at claim **and** again at fill. 3,000 random instants of the calendar match the IANA time zone database. |
| **Decimals** | An 8-decimal stock with an 18-decimal feed and a 6-decimal quote (the contract reads decimals on chain; mainnet is 18 / 8 / 6). | Pool price, minimum output ($297 on a $300 order at 1%) and the executed swap are right. |
| **Rounding** | 300 random amounts, prices and slippages: `minAmountOut` against an exact big-integer reference, plus a bound check. Odd fees (+1, +3, +7, +99). | Matches exactly; rounds **down** only (never over-promises, within 2 raw units). Burned + keeper payout equals the fee, and the keeper gets the odd unit. Rounding cannot be farmed: every order is separate and min-out only ever rounds against the order, not the contract. |
| **Keeper griefing** | A keeper hoarding claims it never fills; an owner cancelling mid-window or after it; a claim lapsing while the market is closed; stealing a live claim; filling an unclaimed order. | Hoarder pays a slash per order. Mid-window cancel costs the keeper nothing, post-window cancel still slashes. A closed market frees the claim without penalty. Claims are exclusive. |
| **Slashing edges** | Slash below the minimum bond; live claims after a slash; capacity (`bond / slash`) after each slash; top-up; unbond with a lapsed claim. | A slashed keeper keeps filling its live claims, cannot claim new orders until it tops up, claims never exceed what the bond covers. Randomized sequences (10,000 steps) check these continuously. |
| **Owner powers** | Searched the ABI for owner / admin / pause / upgrade / setter functions. | None. `minBond`, `slashAmount`, the router and every market are `immutable`. |

## Known limits (design trade-offs, not bugs)

- **A keeper picks when to fill**, and can sandwich its own fill inside the user's slippage (at most 3%, 1% by default). Min-out is derived from the oracle, so the user's worst case is bounded.
- **Fast crashes queue the order.** If the pool moves more than the 1.5% band before the oracle updates, orders wait instead of firing at a price the oracle hasn't confirmed. Intended, but a stop will not fire in that gap.
- **Oracle freshness during a session is heartbeat-based** (up to 24 h 15 min). Some feeds update only on 0.5% moves; the pool band is the second line of defence.
- **Holiday table ends in early 2028.** After that only weekends, the open-of-session check and the heartbeat apply.
- **Issuer powers are outside our control:** it can pause transfers, blocklist addresses, burn tokens from any address (including the escrow) and upgrade the token. Escrow is accounted per order, but an issuer burn from the contract would leave the last claimants short.
- **A fill still needs the pool.** An order that the pool cannot fill (thin liquidity) stays executing until it expires; the owner can always cancel.
- **$WIF liquidity is thin.** Bond and fee sizes are small on purpose.
- **Spam is cheap.** Orders are refundable, so someone can create thousands for gas alone. The contract is unaffected (paginated reads), and the off-chain keeper bounds its scan (finding KW1 in [AUDIT-KEEPER-WEB.md](AUDIT-KEEPER-WEB.md)).
- Not formally verified, and no third-party audit. Treat it as hackathon-grade.

## Tests

`npm test -w contracts`: 87 tests (unit, audit, keeper end-to-end, randomized invariants). `npm run test:stress -w contracts`: 25 seeds × 400 steps. The random sequences now include `release`.
